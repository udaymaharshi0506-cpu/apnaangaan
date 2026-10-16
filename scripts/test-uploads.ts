import "dotenv/config";
import { NextRequest } from "next/server";

async function runTest() {
  console.log("Starting Upload Test...");
  const { ensureAdminAccount } = await import("../src/lib/seed");
  const { db } = await import("../src/db");
  const { users, uploadedImages } = await import("../src/db/schema");
  const { createTestToken } = await import("../src/lib/auth");
  const { dispatch } = await import("../src/lib/api-handler");

  // Ensure an admin/owner user exists
  await ensureAdminAccount();
  const [adminUser] = await db.select().from(users).limit(1);
  if (!adminUser) throw new Error("No user found in database!");

  const token = await createTestToken(adminUser.id);

  const form = new FormData();
  // 1x1 transparent PNG
  const base64Png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==";
  const buffer = Buffer.from(base64Png, "base64");
  form.append("file", new Blob([buffer], { type: "image/png" }), "pixel.png");

  // 1. Test POST /api/uploads
  const headers = new Headers();
  headers.set("authorization", `Bearer ${token}`);
  headers.set("cookie", `aangan_access=${token}`);

  const postReq = new NextRequest("http://localhost:3000/api/uploads", {
    method: "POST",
    headers,
    body: form,
  });

  const postRes = await dispatch(postReq, "POST", { params: Promise.resolve({ segments: ["uploads"] }) });
  console.log("POST /api/uploads Status:", postRes.status);
  const postBody: any = await postRes.json();
  console.log("POST /api/uploads Response:", postBody);

  if (postRes.status !== 201 || !postBody.url) {
    throw new Error(`Upload failed with status ${postRes.status}: ${JSON.stringify(postBody)}`);
  }

  // 2. Test GET /api/uploads/[filename]
  const filename = postBody.url.replace("/api/uploads/", "");
  const getReq = new NextRequest(`http://localhost:3000${postBody.url}`, { method: "GET" });
  const getRes = await dispatch(getReq, "GET", { params: Promise.resolve({ segments: ["uploads", filename] }) });
  console.log("GET /api/uploads Status:", getRes.status);
  console.log("GET Content-Type:", getRes.headers.get("content-type"));
  const arrayBuf = await getRes.arrayBuffer();
  console.log("GET Byte Length:", arrayBuf.byteLength);

  if (getRes.status === 200 && arrayBuf.byteLength === buffer.byteLength) {
    console.log("\n🎉 ALL TESTS PASSED: Image uploaded and retrieved successfully!");
  } else {
    throw new Error("GET verification failed!");
  }

  // Cleanup test image
  const idMatch = filename.match(/^([a-f0-9-]{36})/);
  if (idMatch) {
    const { eq } = await import("drizzle-orm");
    await db.delete(uploadedImages).where(eq(uploadedImages.id, idMatch[1]));
    console.log("Cleaned up test image record from database.");
  }

  process.exit(0);
}

runTest().catch((err) => {
  console.error("Test failed with error:", err);
  process.exit(1);
});
