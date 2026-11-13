import { Pool } from "pg";
import dotenv from "dotenv";
import fs from "node:fs";
import path from "node:path";

dotenv.config();

function formatSqlValue(val: unknown): string {
  if (val === null || val === undefined) return "NULL";
  if (typeof val === "boolean") return val ? "TRUE" : "FALSE";
  if (typeof val === "number") return Number.isFinite(val) ? String(val) : "NULL";
  if (val instanceof Date) return `'${val.toISOString()}'`;
  if (typeof val === "object") {
    // Array or JSON object
    const str = JSON.stringify(val).replace(/'/g, "''");
    return `'${str}'::jsonb`;
  }
  // String or other
  const str = String(val).replace(/'/g, "''");
  return `'${str}'`;
}

export async function createDatabaseBackup() {
  const databaseUrl = process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error("DATABASE_URL is not defined in environment variables (.env).");
  }

  const cleanDatabaseUrl = databaseUrl.replace(/[?&]sslmode=[^&]+/, "");
  const isHostedPg =
    databaseUrl.includes("supabase.co") ||
    databaseUrl.includes("pooler.supabase.com") ||
    databaseUrl.includes("neon.tech");

  const pool = new Pool({
    connectionString: cleanDatabaseUrl,
    ssl: isHostedPg ? { rejectUnauthorized: false } : undefined,
    connectionTimeoutMillis: 15000,
  });

  const client = await pool.connect();

  try {
    const backupDir = path.resolve(process.cwd(), "backups");
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const now = new Date();
    const timestamp = now
      .toISOString()
      .replace(/[-:]/g, "")
      .replace("T", "_")
      .slice(0, 15);

    const sqlFilePath = path.join(backupDir, `backup_${timestamp}.sql`);
    const jsonFilePath = path.join(backupDir, `backup_${timestamp}.json`);

    console.log("==================================================");
    console.log("       AANGAN DATABASE BACKUP ENGINE");
    console.log("==================================================");
    console.log(`Connecting to: ${databaseUrl.replace(/:[^:@]+@/, ":****@")}`);
    console.log(`Target Directory: ${backupDir}`);
    console.log(`Timestamp: ${now.toISOString()}\n`);

    // 1. Fetch all ENUM types in public
    const enumsRes = await client.query(`
      SELECT t.typname as enum_name, array_agg(e.enumlabel ORDER BY e.enumsortorder) as enum_values
      FROM pg_type t
      JOIN pg_enum e ON t.oid = e.enumtypid
      JOIN pg_catalog.pg_namespace n ON n.oid = t.typnamespace
      WHERE n.nspname = 'public'
      GROUP BY t.typname;
    `);

    let sqlContent = `-- AANGAN DATABASE BACKUP
-- Created at: ${now.toISOString()}
-- Database: PostgreSQL

SET statement_timeout = 0;
SET lock_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SET check_function_bodies = false;
SET client_min_messages = warning;
SET row_security = off;

--
-- ENUM TYPES
--
`;

    for (const enumRow of enumsRes.rows) {
      const rawValues = Array.isArray(enumRow.enum_values)
        ? enumRow.enum_values
        : String(enumRow.enum_values).replace(/^\{|\}$/g, "").split(",");
      const vals = rawValues.map((v: string) => `'${v.trim().replace(/'/g, "''")}'`).join(", ");
      sqlContent += `DO $$ BEGIN\n  CREATE TYPE public."${enumRow.enum_name}" AS ENUM (${vals});\nEXCEPTION\n  WHEN duplicate_object THEN null;\nEND $$;\n\n`;
    }

    // 2. Fetch all public tables
    const tablesRes = await client.query(`
      SELECT table_name 
      FROM information_schema.tables 
      WHERE table_schema = 'public' AND table_type = 'BASE TABLE'
      ORDER BY table_name;
    `);

    const tableNames: string[] = tablesRes.rows.map((r) => r.table_name);
    const backupJson: Record<string, unknown> = {
      meta: {
        timestamp: now.toISOString(),
        tableCount: tableNames.length,
        tables: tableNames,
      },
      schemas: {},
      data: {},
    };

    console.log(`Found ${tableNames.length} tables in public schema.`);
    console.log("Extracting schema structures and rows...\n");

    const schemasObj: Record<string, unknown> = {};
    const dataObj: Record<string, unknown> = {};

    for (const table of tableNames) {
      // Columns
      const colsRes = await client.query(`
        SELECT 
          column_name, 
          udt_name,
          data_type, 
          is_nullable, 
          column_default, 
          character_maximum_length
        FROM information_schema.columns 
        WHERE table_schema = 'public' AND table_name = $1
        ORDER BY ordinal_position;
      `, [table]);

      // Constraints
      const consRes = await client.query(`
        SELECT 
          c.conname, 
          c.contype, 
          pg_get_constraintdef(c.oid) as def
        FROM pg_constraint c 
        JOIN pg_class t ON c.conrelid = t.oid 
        JOIN pg_namespace n ON n.oid = t.relnamespace
        WHERE n.nspname = 'public' AND t.relname = $1;
      `, [table]);

      // Indexes
      const idxRes = await client.query(`
        SELECT indexname, indexdef 
        FROM pg_indexes 
        WHERE schemaname = 'public' AND tablename = $1;
      `, [table]);

      schemasObj[table] = {
        columns: colsRes.rows,
        constraints: consRes.rows,
        indexes: idxRes.rows,
      };

      // Table DDL in SQL
      sqlContent += `\n--\n-- Table structure for: ${table}\n--\n`;
      sqlContent += `CREATE TABLE IF NOT EXISTS public."${table}" (\n`;

      const colDefs: string[] = [];
      for (const col of colsRes.rows) {
        let typeStr = col.data_type;
        if (col.data_type === "USER-DEFINED") {
          typeStr = `public."${col.udt_name}"`;
        } else if (col.data_type === "character varying") {
          typeStr = col.character_maximum_length ? `varchar(${col.character_maximum_length})` : "varchar";
        }

        let def = `  "${col.column_name}" ${typeStr}`;
        if (col.column_default) {
          def += ` DEFAULT ${col.column_default}`;
        }
        if (col.is_nullable === "NO") {
          def += " NOT NULL";
        }
        colDefs.push(def);
      }

      sqlContent += colDefs.join(",\n");
      sqlContent += `\n);\n`;

      // Fetch Table Rows
      const rowsRes = await client.query(`SELECT * FROM public."${table}";`);
      const rows = rowsRes.rows;
      dataObj[table] = rows;

      console.log(`  ✓ [${table}] - Schema captured & ${rows.length} rows exported.`);

      if (rows.length > 0) {
        sqlContent += `\n-- Data for: ${table}\n`;
        for (const row of rows) {
          const keys = Object.keys(row);
          const colList = keys.map((k) => `"${k}"`).join(", ");
          const valList = keys.map((k) => formatSqlValue(row[k])).join(", ");
          sqlContent += `INSERT INTO public."${table}" (${colList}) VALUES (${valList}) ON CONFLICT DO NOTHING;\n`;
        }
      }
    }

    // Add Constraints and Indexes after tables exist
    sqlContent += `\n--\n-- Constraints and Indexes\n--\n`;
    for (const table of tableNames) {
      const constraints = (schemasObj[table] as { constraints: Array<{ conname: string; def: string; contype: string }> }).constraints;
      for (const con of constraints) {
        if (con.contype === "p" || con.contype === "u" || con.contype === "f") {
          sqlContent += `ALTER TABLE ONLY public."${table}" DROP CONSTRAINT IF EXISTS "${con.conname}";\n`;
          sqlContent += `ALTER TABLE ONLY public."${table}" ADD CONSTRAINT "${con.conname}" ${con.def};\n`;
        }
      }
    }

    backupJson.schemas = schemasObj;
    backupJson.data = dataObj;

    // Write to files
    fs.writeFileSync(sqlFilePath, sqlContent, "utf8");
    fs.writeFileSync(jsonFilePath, JSON.stringify(backupJson, null, 2), "utf8");

    // Also write latest aliases
    const latestSql = path.join(backupDir, "latest.sql");
    const latestJson = path.join(backupDir, "latest.json");
    fs.writeFileSync(latestSql, sqlContent, "utf8");
    fs.writeFileSync(latestJson, JSON.stringify(backupJson, null, 2), "utf8");

    console.log("\n==================================================");
    console.log("   DATABASE BACKUP COMPLETED SUCCESSFULLY! ");
    console.log("==================================================");
    console.log(`SQL Dump File:  ${sqlFilePath} (${(fs.statSync(sqlFilePath).size / 1024).toFixed(1)} KB)`);
    console.log(`JSON Dump File: ${jsonFilePath} (${(fs.statSync(jsonFilePath).size / 1024).toFixed(1)} KB)`);
    console.log(`Latest Copy:    ${latestSql} & ${latestJson}`);
    console.log("==================================================\n");

    return { sqlFilePath, jsonFilePath, timestamp };
  } finally {
    client.release();
    await pool.end();
  }
}

if (process.argv[1]?.endsWith("backup-db.ts") || process.argv[1]?.endsWith("backup-db.js")) {
  createDatabaseBackup().catch((err) => {
    console.error("Database backup failed:", err);
    process.exit(1);
  });
}
