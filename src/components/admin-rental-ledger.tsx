"use client";

import React, { useState, useEffect, useMemo } from "react";
import Link from "next/link";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  BadgeAlert,
  BadgeCheck,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  Clock3,
  CreditCard,
  DollarSign,
  Download,
  ExternalLink,
  Eye,
  FileSpreadsheet,
  FileText,
  Filter,
  Home,
  IndianRupee,
  Info,
  KeyRound,
  LayoutDashboard,
  MapPin,
  MessageSquare,
  Phone,
  Plus,
  RefreshCw,
  Search,
  ShieldCheck,
  Sparkles,
  TrendingUp,
  UserCheck,
  UsersRound,
  Wallet,
  X,
} from "lucide-react";
import { apiFetch } from "@/components/providers";

export type DashboardKPIs = {
  totalFlatsListed: {
    total: number;
    rented: number;
    availablePending: number;
    underReview: number;
  };
  flatsCurrentlyRented: {
    count: number;
    occupancyRate: number;
  };
  flatsPendingAvailable: {
    count: number;
    available: number;
    dealInProgress: number;
  };
  totalRevenue: {
    allTime: number;
    thisMonth: number;
    breakdown: {
      ownerFees: number;
      seekerFees: number;
      managedListingFees: number;
    };
    thisMonthBreakdown: {
      ownerFees: number;
      seekerFees: number;
      managedListingFees: number;
    };
  };
  moneyInAccount: {
    netCollected: number;
    totalCredits: number;
    totalDebits: number;
  };
  securityDepositOverview: {
    totalExpected: number;
    collectedSoFar: number;
    remainingPending: number;
  };
  pendingBrokerageFees: {
    pendingFromOwners: number;
    pendingFromSeekers: number;
    totalPending: number;
  };
};

export type AnalyticsData = {
  byLocality: Array<{ locality: string; rented: number; pending: number; total: number }>;
  byPropertyType: Array<{ type: string; rented: number; pending: number; total: number }>;
  byStayDuration: Array<{ duration: string; dealsCount: number; totalRent: number }>;
  cashflowSummary: {
    securityDeposit: { expected: number; collected: number; remaining: number; collectedPct: number };
    ownerBrokerage: { expected: number; collected: number; remaining: number; collectedPct: number };
    seekerBrokerage: { expected: number; collected: number; remaining: number; collectedPct: number };
    totalCashflow: { expected: number; collected: number; remaining: number; collectedPct: number };
  };
};

export type EnrichedDeal = {
  id: string;
  dealCode: string;
  dealStatus: string;
  createdAt: string;
  updatedAt: string;
  leaseStartDate: string | null;
  leaseEndDate: string | null;
  monthlyRent: number;
  stayDurationMonths: number;
  notes: string | null;
  hasOverdueOrPending: boolean;
  property: {
    id: string;
    title: string;
    locality: string;
    address: string;
    propertyType: string;
    bhkOrRoomType: string;
    rentalStatus: string;
  };
  owner: {
    id: string;
    name: string;
    phone: string;
    email: string;
    feeStatus: "paid" | "partial" | "pending";
    feeTotal: number;
    feeCollected: number;
    feeRemaining: number;
    lastPaymentDate: string | null;
    lastPaymentMode: string | null;
  };
  seeker: {
    id: string | null;
    name: string;
    phone: string;
    email: string;
    feeStatus: "paid" | "partial" | "pending";
    feeTotal: number;
    feeCollected: number;
    feeRemaining: number;
    lastPaymentDate: string | null;
    lastPaymentMode: string | null;
  };
  securityDeposit: {
    total: number;
    collected: number;
    remaining: number;
    status: "collected" | "partial" | "pending";
  };
};

export type InventoryItem = {
  id: string;
  title: string;
  locality: string;
  city: string;
  propertyType: string;
  bhkOrRoomType: string;
  monthlyRent: number;
  deposit: number;
  rentalStatus: string;
  rentalStatusLabel: string;
  status: string;
  verified: boolean;
  ownerName: string;
  ownerPhone: string;
  currentTenant: {
    name: string | null;
    phone: string | null;
    leaseStartDate: string | null;
    leaseEndDate: string | null;
  } | null;
  daysVacant: number;
  createdAt: string;
};

export type TransactionItem = {
  id: string;
  txnCode: string;
  dealId: string | null;
  propertyId: string | null;
  payerType: string;
  payerName: string;
  category: string;
  amount: string;
  direction: "credit" | "debit";
  paymentMode: string;
  referenceId: string | null;
  status: string;
  reconciliationStatus: string;
  notes: string | null;
  recordedByAdminName: string | null;
  createdAt: string;
  runningBalance?: number;
};

interface AdminRentalLedgerProps {
  onOpenRequestsQueue?: () => void;
  onOpenModerationQueue?: () => void;
}

export function AdminRentalLedger({ onOpenRequestsQueue, onOpenModerationQueue }: AdminRentalLedgerProps) {
  const [activeTab, setActiveTab] = useState<"overview" | "inventory" | "deals" | "ledger">("overview");
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [kpis, setKpis] = useState<DashboardKPIs | null>(null);
  const [analytics, setAnalytics] = useState<AnalyticsData | null>(null);

  // Ledger state
  const [deals, setDeals] = useState<EnrichedDeal[]>([]);
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [transactions, setTransactions] = useState<TransactionItem[]>([]);

  // Filters
  const [searchQuery, setSearchQuery] = useState("");
  const [dealFilter, setDealFilter] = useState<"all" | "pending_deposit" | "owner_fee_pending" | "seeker_fee_pending" | "overdue">("all");
  const [inventoryFilter, setInventoryFilter] = useState<"all" | "rented" | "available_pending" | "deal_in_progress" | "pending_review">("all");
  const [txnCategoryFilter, setTxnCategoryFilter] = useState<string>("all");

  // Modals
  const [paymentModalOpen, setPaymentModalOpen] = useState(false);
  const [selectedDealForPayment, setSelectedDealForPayment] = useState<EnrichedDeal | null>(null);
  const [newDealModalOpen, setNewDealModalOpen] = useState(false);
  const [selectedPropertyForDeal, setSelectedPropertyForDeal] = useState<InventoryItem | null>(null);
  const [statusUpdateProperty, setStatusUpdateProperty] = useState<InventoryItem | null>(null);

  // Form states
  const [submittingPayment, setSubmittingPayment] = useState(false);
  const [paymentForm, setPaymentForm] = useState({
    category: "owner_brokerage" as "owner_brokerage" | "seeker_brokerage" | "security_deposit" | "managed_listing_fee" | "refund_or_payout",
    payerType: "owner" as "owner" | "seeker" | "other",
    payerName: "",
    amount: "",
    direction: "credit" as "credit" | "debit",
    paymentMode: "upi",
    referenceId: "",
    notes: "",
  });

  const [submittingDeal, setSubmittingDeal] = useState(false);
  const [newDealForm, setNewDealForm] = useState({
    propertyId: "",
    seekerName: "",
    seekerPhone: "",
    seekerEmail: "",
    monthlyRent: "",
    stayDurationMonths: "11",
    securityDepositTotal: "",
    securityDepositCollected: "",
    ownerFeeTotal: "",
    ownerFeeCollected: "",
    seekerFeeTotal: "",
    seekerFeeCollected: "",
    dealStatus: "active_rented",
    notes: "",
  });

  // Toast helper
  const [toastMessage, setToastMessage] = useState<{ text: string; type: "success" | "error" } | null>(null);
  const showToast = (text: string, type: "success" | "error" = "success") => {
    setToastMessage({ text, type });
    setTimeout(() => setToastMessage(null), 4500);
  };

  const loadDashboardData = async (isSilent = false) => {
    if (!isSilent) setRefreshing(true);
    try {
      const [summaryRes, ledgerRes] = await Promise.all([
        apiFetch<{ kpis: DashboardKPIs; analytics: AnalyticsData }>("/api/admin/dashboard-summary"),
        apiFetch<{ deals: EnrichedDeal[]; inventory: InventoryItem[]; transactions: TransactionItem[] }>("/api/admin/deals-ledger"),
      ]);

      if (summaryRes?.kpis) {
        setKpis(summaryRes.kpis);
        setAnalytics(summaryRes.analytics);
      }
      if (ledgerRes) {
        setDeals(ledgerRes.deals || []);
        setInventory(ledgerRes.inventory || []);
        setTransactions(ledgerRes.transactions || []);
      }
    } catch (err) {
      console.error("Failed to load rental ledger data:", err);
      showToast(err instanceof Error ? err.message : "Failed to load telemetry", "error");
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  };

  useEffect(() => {
    void loadDashboardData();
  }, []);

  // Format currency in Indian Rupees
  const formatRupee = (num: number | undefined | null) => {
    if (num === undefined || num === null) return "₹0";
    return "₹" + Number(num).toLocaleString("en-IN");
  };

  // Filtered Deals
  const filteredDeals = useMemo(() => {
    let list = [...deals];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (d) =>
          d.dealCode.toLowerCase().includes(q) ||
          d.property.title.toLowerCase().includes(q) ||
          d.property.locality.toLowerCase().includes(q) ||
          d.owner.name.toLowerCase().includes(q) ||
          d.owner.phone.includes(q) ||
          d.seeker.name.toLowerCase().includes(q) ||
          d.seeker.phone.includes(q)
      );
    }
    if (dealFilter === "pending_deposit") {
      list = list.filter((d) => d.securityDeposit.remaining > 0);
    } else if (dealFilter === "owner_fee_pending") {
      list = list.filter((d) => d.owner.feeRemaining > 0);
    } else if (dealFilter === "seeker_fee_pending") {
      list = list.filter((d) => d.seeker.feeRemaining > 0);
    } else if (dealFilter === "overdue") {
      list = list.filter((d) => d.hasOverdueOrPending);
    }
    return list;
  }, [deals, searchQuery, dealFilter]);

  // Filtered Inventory
  const filteredInventory = useMemo(() => {
    let list = [...inventory];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (i) =>
          i.title.toLowerCase().includes(q) ||
          i.locality.toLowerCase().includes(q) ||
          i.ownerName.toLowerCase().includes(q) ||
          i.ownerPhone.includes(q) ||
          (i.currentTenant && i.currentTenant.name?.toLowerCase().includes(q))
      );
    }
    if (inventoryFilter !== "all") {
      if (inventoryFilter === "pending_review") {
        list = list.filter((i) => i.status === "pending_review" || !i.verified);
      } else {
        list = list.filter((i) => i.rentalStatus === inventoryFilter);
      }
    }
    return list;
  }, [inventory, searchQuery, inventoryFilter]);

  // Filtered Transactions
  const filteredTransactions = useMemo(() => {
    let list = [...transactions];
    if (searchQuery.trim()) {
      const q = searchQuery.toLowerCase();
      list = list.filter(
        (t) =>
          t.txnCode.toLowerCase().includes(q) ||
          (t.referenceId && t.referenceId.toLowerCase().includes(q)) ||
          t.payerName.toLowerCase().includes(q) ||
          t.category.toLowerCase().includes(q)
      );
    }
    if (txnCategoryFilter !== "all") {
      list = list.filter((t) => t.category === txnCategoryFilter);
    }
    return list;
  }, [transactions, searchQuery, txnCategoryFilter]);

  // Open Payment modal pre-filled from deal
  const openPaymentForDeal = (deal: EnrichedDeal, defaultCategory: "owner_brokerage" | "seeker_brokerage" | "security_deposit" = "owner_brokerage") => {
    setSelectedDealForPayment(deal);
    const isOwner = defaultCategory === "owner_brokerage";
    const payerName = isOwner ? deal.owner.name : deal.seeker.name;
    const defaultAmount =
      defaultCategory === "owner_brokerage"
        ? deal.owner.feeRemaining || deal.owner.feeTotal
        : defaultCategory === "seeker_brokerage"
        ? deal.seeker.feeRemaining || deal.seeker.feeTotal
        : deal.securityDeposit.remaining || deal.securityDeposit.total;

    setPaymentForm({
      category: defaultCategory,
      payerType: isOwner ? "owner" : "seeker",
      payerName: payerName || "",
      amount: String(defaultAmount || ""),
      direction: "credit",
      paymentMode: "upi",
      referenceId: "",
      notes: `Payment for ${deal.property.title} (${deal.dealCode})`,
    });
    setPaymentModalOpen(true);
  };

  // Submit Payment
  const handleRecordPayment = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingPayment) return;
    const amt = Number(paymentForm.amount);
    if (!amt || amt <= 0) {
      showToast("Please enter a valid amount greater than ₹0", "error");
      return;
    }
    setSubmittingPayment(true);
    try {
      await apiFetch("/api/admin/record-payment", {
        method: "POST",
        body: JSON.stringify({
          dealId: selectedDealForPayment?.id || undefined,
          propertyId: selectedDealForPayment?.property.id || undefined,
          category: paymentForm.category,
          payerType: paymentForm.payerType,
          payerName: paymentForm.payerName,
          amount: amt,
          direction: paymentForm.direction,
          paymentMode: paymentForm.paymentMode,
          referenceId: paymentForm.referenceId,
          notes: paymentForm.notes,
        }),
      });

      showToast(`Payment of ${formatRupee(amt)} recorded successfully!`);
      setPaymentModalOpen(false);
      setSelectedDealForPayment(null);
      await loadDashboardData(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to record payment", "error");
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Submit New Deal
  const handleCreateDeal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (submittingDeal) return;
    if (!newDealForm.propertyId) {
      showToast("Please select a flat for this deal", "error");
      return;
    }
    setSubmittingDeal(true);
    try {
      await apiFetch("/api/admin/rental-deals", {
        method: "POST",
        body: JSON.stringify(newDealForm),
      });

      showToast("Rental deal created and flat status updated!");
      setNewDealModalOpen(false);
      setSelectedPropertyForDeal(null);
      await loadDashboardData(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to create deal", "error");
    } finally {
      setSubmittingDeal(false);
    }
  };

  // Update Property Rental Status
  const handleUpdatePropertyRentalStatus = async (propertyId: string, newRentalStatus: string) => {
    try {
      await apiFetch(`/api/admin/properties/${propertyId}/rental-status`, {
        method: "PATCH",
        body: JSON.stringify({ rentalStatus: newRentalStatus }),
      });
      showToast(`Flat rental status updated to ${newRentalStatus.replace("_", " ")}`);
      setStatusUpdateProperty(null);
      await loadDashboardData(true);
    } catch (err) {
      showToast(err instanceof Error ? err.message : "Failed to update flat status", "error");
    }
  };

  // CSV Export utility
  const exportCurrentData = () => {
    let headers: string[] = [];
    let rows: string[][] = [];
    let filename = `apnaaangan_${activeTab}_${new Date().toISOString().slice(0, 10)}.csv`;

    if (activeTab === "deals") {
      headers = [
        "Deal Code",
        "Property Title",
        "Locality",
        "Monthly Rent (Rs)",
        "Owner Name",
        "Owner Phone",
        "Owner Fee Total",
        "Owner Fee Collected",
        "Owner Fee Remaining",
        "Owner Fee Status",
        "Seeker Name",
        "Seeker Phone",
        "Seeker Fee Total",
        "Seeker Fee Collected",
        "Seeker Fee Remaining",
        "Seeker Fee Status",
        "Security Deposit Total",
        "Security Deposit Collected",
        "Security Deposit Remaining",
        "Deposit Status",
        "Deal Status",
      ];
      rows = filteredDeals.map((d) => [
        d.dealCode,
        `"${d.property.title.replace(/"/g, '""')}"`,
        `"${d.property.locality}"`,
        String(d.monthlyRent),
        `"${d.owner.name}"`,
        d.owner.phone,
        String(d.owner.feeTotal),
        String(d.owner.feeCollected),
        String(d.owner.feeRemaining),
        d.owner.feeStatus,
        `"${d.seeker.name}"`,
        d.seeker.phone,
        String(d.seeker.feeTotal),
        String(d.seeker.feeCollected),
        String(d.seeker.feeRemaining),
        d.seeker.feeStatus,
        String(d.securityDeposit.total),
        String(d.securityDeposit.collected),
        String(d.securityDeposit.remaining),
        d.securityDeposit.status,
        d.dealStatus,
      ]);
    } else if (activeTab === "inventory") {
      headers = [
        "Flat ID",
        "Property Title",
        "Locality",
        "Property Type",
        "BHK",
        "Monthly Rent (Rs)",
        "Security Deposit",
        "Rental Status",
        "Owner Name",
        "Owner Phone",
        "Current Tenant",
        "Tenant Phone",
        "Days Vacant",
      ];
      rows = filteredInventory.map((i) => [
        i.id,
        `"${i.title.replace(/"/g, '""')}"`,
        `"${i.locality}"`,
        i.propertyType,
        i.bhkOrRoomType,
        String(i.monthlyRent),
        String(i.deposit),
        i.rentalStatusLabel,
        `"${i.ownerName}"`,
        i.ownerPhone,
        `"${i.currentTenant?.name || "None"}"`,
        i.currentTenant?.phone || "-",
        String(i.daysVacant),
      ]);
    } else {
      headers = [
        "Txn Code",
        "Date",
        "Payer Name",
        "Payer Type",
        "Category",
        "Direction",
        "Amount (Rs)",
        "Payment Mode",
        "Reference ID",
        "Status",
        "Running Balance (Rs)",
        "Recorded By",
      ];
      rows = filteredTransactions.map((t) => [
        t.txnCode,
        new Date(t.createdAt).toLocaleDateString("en-IN"),
        `"${t.payerName}"`,
        t.payerType,
        t.category,
        t.direction,
        t.amount,
        t.paymentMode,
        t.referenceId || "-",
        t.status,
        String(t.runningBalance || "-"),
        `"${t.recordedByAdminName || "Admin"}"`,
      ]);
    }

    const csvContent = "data:text/csv;charset=utf-8," + [headers.join(","), ...rows.map((e) => e.join(","))].join("\n");
    const encodedUri = encodeURI(csvContent);
    const link = document.createElement("a");
    link.setAttribute("href", encodedUri);
    link.setAttribute("download", filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    showToast(`Exported ${rows.length} rows to ${filename}`);
  };

  return (
    <div className="admin-rental-ledger-root">
      {/* Toast notification */}
      {toastMessage && (
        <div className={`admin-floating-toast toast-${toastMessage.type}`}>
          {toastMessage.type === "success" ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
          <span>{toastMessage.text}</span>
          <button onClick={() => setToastMessage(null)}>
            <X size={14} />
          </button>
        </div>
      )}

      {/* Control Strip & Breadcrumbs */}
      <div className="ledger-header-panel">
        <div className="ledger-title-group">
          <span className="eyebrow" style={{ color: "#059669", display: "inline-flex", alignItems: "center", gap: 6 }}>
            <Wallet size={15} /> APNA AANGAN REVENUE &amp; RENTAL TELEMETRY
          </span>
          <h1>Rental Operations &amp; Financial Ledger</h1>
          <p>
            Real-time tracking of rented vs. pending flats, security deposits, owner/seeker brokerage collections, and net settled account balance.
          </p>
        </div>

        <div className="ledger-actions-group">
          <button
            className="btn btn-sm btn-outline"
            onClick={() => void loadDashboardData()}
            disabled={refreshing}
            title="Sync all metrics with live database"
          >
            <RefreshCw size={14} className={refreshing ? "spin-animate" : ""} />
            <span>{refreshing ? "Syncing..." : "Sync Database"}</span>
          </button>

          <button
            className="btn btn-sm btn-outline"
            onClick={() => {
              setSelectedPropertyForDeal(null);
              setNewDealForm({
                propertyId: inventory[0]?.id || "",
                seekerName: "",
                seekerPhone: "",
                seekerEmail: "",
                monthlyRent: inventory[0] ? String(inventory[0].monthlyRent) : "",
                stayDurationMonths: "11",
                securityDepositTotal: inventory[0] ? String(inventory[0].monthlyRent * 2) : "",
                securityDepositCollected: "",
                ownerFeeTotal: inventory[0] ? String(inventory[0].monthlyRent * 0.15) : "",
                ownerFeeCollected: "",
                seekerFeeTotal: inventory[0] ? String(inventory[0].monthlyRent * 0.15) : "",
                seekerFeeCollected: "",
                dealStatus: "active_rented",
                notes: "",
              });
              setNewDealModalOpen(true);
            }}
          >
            <Plus size={14} />
            <span>+ New Rental Deal</span>
          </button>

          <button
            className="btn btn-sm btn-primary"
            onClick={() => {
              setSelectedDealForPayment(null);
              setPaymentForm({
                category: "owner_brokerage",
                payerType: "owner",
                payerName: "",
                amount: "",
                direction: "credit",
                paymentMode: "upi",
                referenceId: "",
                notes: "",
              });
              setPaymentModalOpen(true);
            }}
          >
            <CreditCard size={14} />
            <span>+ Record Payment</span>
          </button>

          <button className="btn btn-sm btn-outline" onClick={exportCurrentData} title="Export CSV for accounting">
            <Download size={14} />
            <span>Export CSV</span>
          </button>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 1: 7 TOP-LEVEL KPI SUMMARY CARDS (REAL-TIME AGGREGATIONS)
         ───────────────────────────────────────────────────────────── */}
      <div className="kpi-summary-grid">
        {/* Card 1: Total Flats Listed */}
        <div
          className="kpi-card card-emerald interactive"
          onClick={() => {
            setActiveTab("inventory");
            setInventoryFilter("all");
          }}
          title="Click to view all flat inventory"
        >
          <div className="kpi-card-top">
            <span className="kpi-icon-wrap emerald"><Building2 size={20} /></span>
            <span className="kpi-badge emerald-badge">Live Inventory</span>
          </div>
          <span className="kpi-label">1. Total Flats Listed</span>
          <strong className="kpi-number">{kpis?.totalFlatsListed.total ?? 0}</strong>
          <div className="kpi-sub-breakdown">
            <span className="pill-rented">{kpis?.totalFlatsListed.rented || 0} Rented</span>
            <span>·</span>
            <span className="pill-pending">{kpis?.totalFlatsListed.availablePending || 0} Available</span>
            <span>·</span>
            <span className="pill-review">{kpis?.totalFlatsListed.underReview || 0} In Review</span>
          </div>
          <div className="kpi-footer-link">
            <span>Explore flat inventory</span>
            <ArrowUpRight size={13} />
          </div>
        </div>

        {/* Card 2: Flats Currently Rented */}
        <div
          className="kpi-card card-green interactive"
          onClick={() => {
            setActiveTab("inventory");
            setInventoryFilter("rented");
          }}
          title="Click to view currently rented flats"
        >
          <div className="kpi-card-top">
            <span className="kpi-icon-wrap green"><KeyRound size={20} /></span>
            <span className="kpi-badge green-badge">{kpis?.flatsCurrentlyRented.occupancyRate || 0}% Occupancy</span>
          </div>
          <span className="kpi-label">2. Flats Currently Rented</span>
          <strong className="kpi-number">{kpis?.flatsCurrentlyRented.count || 0}</strong>
          <div className="kpi-progress-bar-wrap">
            <div className="kpi-progress-bar">
              <span className="kpi-progress-fill green-fill" style={{ width: `${Math.max(8, kpis?.flatsCurrentlyRented.occupancyRate || 0)}%` }} />
            </div>
            <small>{kpis?.flatsCurrentlyRented.count || 0} of {kpis?.totalFlatsListed.total || 0} flats occupied</small>
          </div>
          <div className="kpi-footer-link">
            <span>View active tenants</span>
            <ArrowUpRight size={13} />
          </div>
        </div>

        {/* Card 3: Flats Pending / Available to Rent */}
        <div
          className="kpi-card card-blue interactive"
          onClick={() => {
            setActiveTab("inventory");
            setInventoryFilter("available_pending");
          }}
          title="Click to view available flats"
        >
          <div className="kpi-card-top">
            <span className="kpi-icon-wrap blue"><Clock3 size={20} /></span>
            <span className="kpi-badge blue-badge">Open Inventory</span>
          </div>
          <span className="kpi-label">3. Flats Pending / Available</span>
          <strong className="kpi-number">{kpis?.flatsPendingAvailable.count || 0}</strong>
          <div className="kpi-sub-breakdown">
            <span>{kpis?.flatsPendingAvailable.available || 0} Ready to Move</span>
            <span>·</span>
            <span>{kpis?.flatsPendingAvailable.dealInProgress || 0} Deal In Progress</span>
          </div>
          <div className="kpi-footer-link">
            <span>Manage open units</span>
            <ArrowUpRight size={13} />
          </div>
        </div>

        {/* Card 4: Total Revenue Earned */}
        <div
          className="kpi-card card-purple interactive"
          onClick={() => setActiveTab("ledger")}
          title="Click to view revenue ledger"
        >
          <div className="kpi-card-top">
            <span className="kpi-icon-wrap purple"><Sparkles size={20} /></span>
            <span className="kpi-badge purple-badge">{formatRupee(kpis?.totalRevenue.thisMonth)} This Month</span>
          </div>
          <span className="kpi-label">4. Total Revenue Earned</span>
          <strong className="kpi-number">{formatRupee(kpis?.totalRevenue.allTime)}</strong>
          <div className="kpi-sub-breakdown vertical">
            <small>Owner: {formatRupee(kpis?.totalRevenue.breakdown.ownerFees)} · Seeker: {formatRupee(kpis?.totalRevenue.breakdown.seekerFees)}</small>
            <small>Managed Listing Fees: {formatRupee(kpis?.totalRevenue.breakdown.managedListingFees)}</small>
          </div>
          <div className="kpi-footer-link">
            <span>View revenue transactions</span>
            <ArrowUpRight size={13} />
          </div>
        </div>

        {/* Card 5: Money in Our Account (Net Collected) */}
        <div
          className="kpi-card card-teal interactive"
          onClick={() => setActiveTab("ledger")}
          title="Click to inspect account ledger"
        >
          <div className="kpi-card-top">
            <span className="kpi-icon-wrap teal"><Wallet size={20} /></span>
            <span className="kpi-badge teal-badge">Settled Cash</span>
          </div>
          <span className="kpi-label">5. Money in Our Account</span>
          <strong className="kpi-number highlight-balance">{formatRupee(kpis?.moneyInAccount.netCollected)}</strong>
          <div className="kpi-sub-breakdown">
            <span style={{ color: "#059669" }}>+ {formatRupee(kpis?.moneyInAccount.totalCredits)} Settled</span>
            <span>·</span>
            <span style={{ color: "#dc2626" }}>- {formatRupee(kpis?.moneyInAccount.totalDebits)} Payouts</span>
          </div>
          <div className="kpi-footer-link">
            <span>Reconcile bank balance</span>
            <ArrowUpRight size={13} />
          </div>
        </div>

        {/* Card 6: Security Deposit Overview */}
        <div
          className="kpi-card card-amber interactive"
          onClick={() => {
            setActiveTab("deals");
            setDealFilter("pending_deposit");
          }}
          title="Click to view security deposits"
        >
          <div className="kpi-card-top">
            <span className="kpi-icon-wrap amber"><ShieldCheck size={20} /></span>
            <span className="kpi-badge alert-badge">
              {formatRupee(kpis?.securityDepositOverview.remainingPending)} Pending
            </span>
          </div>
          <span className="kpi-label">6. Security Deposit Overview</span>
          <strong className="kpi-number">{formatRupee(kpis?.securityDepositOverview.collectedSoFar)}</strong>
          <div className="kpi-progress-bar-wrap">
            <div className="kpi-progress-bar">
              {(() => {
                const total = kpis?.securityDepositOverview.totalExpected || 1;
                const collected = kpis?.securityDepositOverview.collectedSoFar || 0;
                const pct = Math.min(100, Math.round((collected / total) * 100));
                return <span className="kpi-progress-fill amber-fill" style={{ width: `${Math.max(6, pct)}%` }} />;
              })()}
            </div>
            <small>
              Expected: {formatRupee(kpis?.securityDepositOverview.totalExpected)} · <strong style={{ color: "#d97706" }}>Remaining: {formatRupee(kpis?.securityDepositOverview.remainingPending)}</strong>
            </small>
          </div>
          <div className="kpi-footer-link">
            <span>View deposit ledger</span>
            <ArrowUpRight size={13} />
          </div>
        </div>

        {/* Card 7: Pending Brokerage / Fees */}
        <div
          className="kpi-card card-rose interactive"
          onClick={() => {
            setActiveTab("deals");
            setDealFilter("overdue");
          }}
          title="Click to collect pending fees"
        >
          <div className="kpi-card-top">
            <span className="kpi-icon-wrap rose"><AlertTriangle size={20} /></span>
            <span className="kpi-badge rose-badge">Collection Due</span>
          </div>
          <span className="kpi-label">7. Pending Brokerage / Fees</span>
          <strong className="kpi-number text-rose">{formatRupee(kpis?.pendingBrokerageFees.totalPending)}</strong>
          <div className="kpi-sub-breakdown">
            <span>Owners: {formatRupee(kpis?.pendingBrokerageFees.pendingFromOwners)}</span>
            <span>·</span>
            <span>Seekers: {formatRupee(kpis?.pendingBrokerageFees.pendingFromSeekers)}</span>
          </div>
          <div className="kpi-footer-link">
            <span>Open collection queue</span>
            <ArrowUpRight size={13} />
          </div>
        </div>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          SECTION 2: DASHBOARD TABS NAVIGATION
         ───────────────────────────────────────────────────────────── */}
      <div className="ledger-tabs-navigation">
        <button
          className={`ledger-tab-btn ${activeTab === "overview" ? "active" : ""}`}
          onClick={() => setActiveTab("overview")}
        >
          <LayoutDashboard size={16} />
          <span>Tab 1: Overview &amp; Analytics</span>
        </button>

        <button
          className={`ledger-tab-btn ${activeTab === "inventory" ? "active" : ""}`}
          onClick={() => setActiveTab("inventory")}
        >
          <Home size={16} />
          <span>Tab 2: Flat Inventory &amp; Status</span>
          <span className="tab-count-pill">{inventory.length}</span>
        </button>

        <button
          className={`ledger-tab-btn ${activeTab === "deals" ? "active" : ""}`}
          onClick={() => setActiveTab("deals")}
        >
          <FileText size={16} />
          <span>Tab 3: Deal-by-Deal Ledger</span>
          <span className="tab-count-pill">{deals.length}</span>
          {deals.some((d) => d.hasOverdueOrPending) && (
            <span className="tab-alert-dot" title="Pending balances detected" />
          )}
        </button>

        <button
          className={`ledger-tab-btn ${activeTab === "ledger" ? "active" : ""}`}
          onClick={() => setActiveTab("ledger")}
        >
          <FileSpreadsheet size={16} />
          <span>Tab 4: Account &amp; Revenue Ledger</span>
          <span className="tab-count-pill">{transactions.length}</span>
        </button>
      </div>

      {/* ─────────────────────────────────────────────────────────────
          TAB 1: OVERVIEW & ANALYTICS
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "overview" && (
        <div className="tab-view-content">
          <div className="overview-analytics-grid">
            {/* Cash Flow Summary Card */}
            <div className="analytics-box cashflow-box">
              <div className="analytics-box-header">
                <div>
                  <h3>Cash-Flow &amp; Collections Summary</h3>
                  <span>Total Expected vs. Collected vs. Remaining across all deals</span>
                </div>
                <span className="status-pill status-settled">
                  {analytics?.cashflowSummary.totalCashflow.collectedPct || 0}% Settled
                </span>
              </div>

              <div className="cashflow-rows-list">
                {/* 1. Security Deposits */}
                <div className="cashflow-row-item">
                  <div className="cashflow-meta">
                    <strong>🛡️ Security Deposits</strong>
                    <span>
                      Expected: {formatRupee(analytics?.cashflowSummary.securityDeposit.expected)} · Collected: {formatRupee(analytics?.cashflowSummary.securityDeposit.collected)} ·{" "}
                      <strong style={{ color: "#d97706" }}>Remaining: {formatRupee(analytics?.cashflowSummary.securityDeposit.remaining)}</strong>
                    </span>
                  </div>
                  <div className="cashflow-track">
                    <span
                      className="cashflow-fill amber"
                      style={{ width: `${Math.max(6, analytics?.cashflowSummary.securityDeposit.collectedPct || 0)}%` }}
                    />
                  </div>
                  <span className="cashflow-pct">{analytics?.cashflowSummary.securityDeposit.collectedPct || 0}%</span>
                </div>

                {/* 2. Owner Brokerage */}
                <div className="cashflow-row-item">
                  <div className="cashflow-meta">
                    <strong>💼 Owner Brokerage / Fees</strong>
                    <span>
                      Expected: {formatRupee(analytics?.cashflowSummary.ownerBrokerage.expected)} · Collected: {formatRupee(analytics?.cashflowSummary.ownerBrokerage.collected)} ·{" "}
                      <strong style={{ color: "#dc2626" }}>Pending: {formatRupee(analytics?.cashflowSummary.ownerBrokerage.remaining)}</strong>
                    </span>
                  </div>
                  <div className="cashflow-track">
                    <span
                      className="cashflow-fill purple"
                      style={{ width: `${Math.max(6, analytics?.cashflowSummary.ownerBrokerage.collectedPct || 0)}%` }}
                    />
                  </div>
                  <span className="cashflow-pct">{analytics?.cashflowSummary.ownerBrokerage.collectedPct || 0}%</span>
                </div>

                {/* 3. Seeker Brokerage */}
                <div className="cashflow-row-item">
                  <div className="cashflow-meta">
                    <strong>🏠 Home Seeker Fees</strong>
                    <span>
                      Expected: {formatRupee(analytics?.cashflowSummary.seekerBrokerage.expected)} · Collected: {formatRupee(analytics?.cashflowSummary.seekerBrokerage.collected)} ·{" "}
                      <strong style={{ color: "#dc2626" }}>Pending: {formatRupee(analytics?.cashflowSummary.seekerBrokerage.remaining)}</strong>
                    </span>
                  </div>
                  <div className="cashflow-track">
                    <span
                      className="cashflow-fill green"
                      style={{ width: `${Math.max(6, analytics?.cashflowSummary.seekerBrokerage.collectedPct || 0)}%` }}
                    />
                  </div>
                  <span className="cashflow-pct">{analytics?.cashflowSummary.seekerBrokerage.collectedPct || 0}%</span>
                </div>
              </div>
            </div>

            {/* Locality Breakdown */}
            <div className="analytics-box">
              <div className="analytics-box-header">
                <div>
                  <h3>Flats by Locality</h3>
                  <span>Rented vs. Available Inventory across prime zones</span>
                </div>
                <span className="chart-chip highlight">{analytics?.byLocality.length || 0} Areas</span>
              </div>
              <div className="analytics-bars-list">
                {(analytics?.byLocality || []).map((loc) => {
                  const pct = Math.round((loc.rented / (loc.total || 1)) * 100);
                  return (
                    <div key={loc.locality} className="analytics-bar-item">
                      <div className="bar-item-meta">
                        <span className="bar-name">
                          <MapPin size={13} style={{ color: "var(--brand)" }} />
                          <strong>{loc.locality}</strong>
                        </span>
                        <span className="bar-numbers">
                          <small>{loc.rented} Rented</small> · <small>{loc.pending} Open</small> · <strong>{loc.total} Flats</strong>
                        </span>
                      </div>
                      <div className="dual-track">
                        <span className="dual-fill rented" style={{ width: `${pct}%` }} />
                        <span className="dual-fill pending" style={{ width: `${100 - pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Property Type Breakdown */}
            <div className="analytics-box">
              <div className="analytics-box-header">
                <div>
                  <h3>Flats by Property Type</h3>
                  <span>Distribution across apartments, independent houses &amp; villas</span>
                </div>
                <span className="chart-chip">{analytics?.byPropertyType.length || 0} Types</span>
              </div>
              <div className="analytics-bars-list">
                {(analytics?.byPropertyType || []).map((t) => {
                  const pct = Math.round((t.rented / (t.total || 1)) * 100);
                  return (
                    <div key={t.type} className="analytics-bar-item">
                      <div className="bar-item-meta">
                        <span className="bar-name">
                          <Building2 size={13} style={{ color: "#0284c7" }} />
                          <strong>{t.type}</strong>
                        </span>
                        <span className="bar-numbers">
                          <small>{t.rented} Rented</small> · <small>{t.pending} Open</small> · <strong>{t.total} Total</strong>
                        </span>
                      </div>
                      <div className="dual-track">
                        <span className="dual-fill rented" style={{ width: `${pct}%` }} />
                        <span className="dual-fill pending" style={{ width: `${100 - pct}%` }} />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Stay Duration Breakdown */}
            <div className="analytics-box">
              <div className="analytics-box-header">
                <div>
                  <h3>Lease &amp; Stay Duration</h3>
                  <span>Tenure distribution and monthly rent yield</span>
                </div>
                <span className="chart-chip highlight">Active Agreements</span>
              </div>
              <div className="analytics-bars-list">
                {(analytics?.byStayDuration || []).map((dur) => (
                  <div key={dur.duration} className="analytics-bar-item">
                    <div className="bar-item-meta">
                      <span className="bar-name">
                        <Calendar size={13} style={{ color: "#7c3aed" }} />
                        <strong>{dur.duration}</strong>
                      </span>
                      <span className="bar-numbers">
                        <strong>{dur.dealsCount} Deals</strong> · Total Monthly Yield: <strong>{formatRupee(dur.totalRent)}</strong>
                      </span>
                    </div>
                    <div className="cashflow-track">
                      <span className="cashflow-fill purple" style={{ width: "100%" }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 2: FLAT INVENTORY & RENTAL STATUS
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "inventory" && (
        <div className="tab-view-content">
          <div className="table-controls-row">
            <div className="table-search-box">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search flat by title, locality, owner name or phone..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="clear-btn">
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="table-filter-chips">
              {[
                { key: "all", label: "All Flats" },
                { key: "rented", label: "Rented (Active)" },
                { key: "available_pending", label: "Pending (Available)" },
                { key: "deal_in_progress", label: "Deal In Progress" },
                { key: "pending_review", label: "Under Review" },
              ].map((f) => (
                <button
                  key={f.key}
                  className={`filter-chip-btn ${inventoryFilter === f.key ? "active" : ""}`}
                  onClick={() => setInventoryFilter(f.key as typeof inventoryFilter)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ledger-table-container">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Flat &amp; Locality</th>
                  <th>Owner Contact</th>
                  <th>Monthly Rent</th>
                  <th>Rental Status</th>
                  <th>Current Tenant</th>
                  <th>Occupancy / Vacancy</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredInventory.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="flat-title-cell">
                        <strong>{item.title}</strong>
                        <span>
                          <MapPin size={11} /> {item.locality}, {item.city} · {item.bhkOrRoomType} ({item.propertyType})
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="owner-contact-cell">
                        <strong>{item.ownerName}</strong>
                        <span>
                          <Phone size={11} /> {item.ownerPhone || "No phone"}
                        </span>
                      </div>
                    </td>
                    <td>
                      <div className="rent-cell">
                        <strong>{formatRupee(item.monthlyRent)}/mo</strong>
                        <small>Deposit: {formatRupee(item.deposit)}</small>
                      </div>
                    </td>
                    <td>
                      <span className={`rental-status-pill status-${item.rentalStatus}`}>
                        {item.rentalStatus === "rented" ? (
                          <>
                            <CheckCircle2 size={12} /> Rented (Active)
                          </>
                        ) : item.rentalStatus === "deal_in_progress" ? (
                          <>
                            <Clock3 size={12} /> Deal In Progress
                          </>
                        ) : item.status === "pending_review" || !item.verified ? (
                          <>
                            <AlertTriangle size={12} /> Verification Pending
                          </>
                        ) : (
                          <>
                            <Home size={12} /> Available to Rent
                          </>
                        )}
                      </span>
                    </td>
                    <td>
                      {item.currentTenant ? (
                        <div className="tenant-info-cell">
                          <strong>{item.currentTenant.name || "Tenant"}</strong>
                          <span>{item.currentTenant.phone || "No phone"}</span>
                        </div>
                      ) : (
                        <span className="no-tenant-label">Vacant</span>
                      )}
                    </td>
                    <td>
                      {item.rentalStatus === "rented" ? (
                        <span className="vacancy-pill rented-pill">Active Lease</span>
                      ) : (
                        <span className="vacancy-pill vacant-pill">{item.daysVacant} days vacant</span>
                      )}
                    </td>
                    <td style={{ textAlign: "right" }}>
                      <div className="row-actions-group">
                        <select
                          className="status-select-dropdown"
                          value={item.rentalStatus}
                          onChange={(e) => void handleUpdatePropertyRentalStatus(item.id, e.target.value)}
                          title="Change flat rental status"
                        >
                          <option value="available_pending">Available (Open)</option>
                          <option value="deal_in_progress">Deal In Progress</option>
                          <option value="rented">Mark Rented</option>
                          <option value="inactive">Inactive</option>
                        </select>

                        <button
                          className="btn btn-xs btn-outline"
                          onClick={() => {
                            setSelectedPropertyForDeal(item);
                            setNewDealForm({
                              propertyId: item.id,
                              seekerName: "",
                              seekerPhone: "",
                              seekerEmail: "",
                              monthlyRent: String(item.monthlyRent),
                              stayDurationMonths: "11",
                              securityDepositTotal: String(item.deposit || item.monthlyRent * 2),
                              securityDepositCollected: "",
                              ownerFeeTotal: String(item.monthlyRent * 0.15),
                              ownerFeeCollected: "",
                              seekerFeeTotal: String(item.monthlyRent * 0.15),
                              seekerFeeCollected: "",
                              dealStatus: "active_rented",
                              notes: `Deal for ${item.title}`,
                            });
                            setNewDealModalOpen(true);
                          }}
                          title="Create deal for this flat"
                        >
                          + Deal
                        </button>

                        <Link
                          href={`/property/${item.id}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn btn-xs btn-ghost"
                          title="View live listing"
                        >
                          <ExternalLink size={13} />
                        </Link>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 3: DEAL-BY-DEAL OWNER & HOME SEEKER LEDGER
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "deals" && (
        <div className="tab-view-content">
          <div className="table-controls-row">
            <div className="table-search-box">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search deals by code, flat title, owner, or tenant..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="clear-btn">
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="table-filter-chips">
              {[
                { key: "all", label: "All Deals" },
                { key: "overdue", label: "⚠️ Action / Overdue Needed" },
                { key: "pending_deposit", label: "Pending Deposits" },
                { key: "owner_fee_pending", label: "Owner Fee Pending" },
                { key: "seeker_fee_pending", label: "Seeker Fee Pending" },
              ].map((f) => (
                <button
                  key={f.key}
                  className={`filter-chip-btn ${dealFilter === f.key ? "active" : ""}`}
                  onClick={() => setDealFilter(f.key as typeof dealFilter)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ledger-table-container">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Deal Code &amp; Flat</th>
                  <th>Owner &amp; Brokerage Status</th>
                  <th>Tenant / Seeker &amp; Brokerage Status</th>
                  <th>Security Deposit</th>
                  <th>Lease Dates</th>
                  <th style={{ textAlign: "right" }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredDeals.map((deal) => (
                  <tr key={deal.id} className={deal.hasOverdueOrPending ? "row-has-pending" : ""}>
                    {/* Flat Details */}
                    <td>
                      <div className="deal-flat-cell">
                        <span className="deal-code-badge">
                          {deal.dealCode}
                          {deal.hasOverdueOrPending && (
                            <span className="overdue-dot" title="Pending collection balance" />
                          )}
                        </span>
                        <strong>{deal.property.title}</strong>
                        <span>
                          <MapPin size={11} /> {deal.property.locality} · {formatRupee(deal.monthlyRent)}/mo
                        </span>
                      </div>
                    </td>

                    {/* Owner Details & Fee */}
                    <td>
                      <div className="party-ledger-cell">
                        <strong>{deal.owner.name}</strong>
                        <span>
                          <Phone size={11} /> {deal.owner.phone || "No phone"}
                        </span>
                        <div className="party-fee-badge-wrap">
                          <span className={`fee-status-badge fee-${deal.owner.feeStatus}`}>
                            Owner: {deal.owner.feeStatus.toUpperCase()}
                          </span>
                          <small>
                            Due: {formatRupee(deal.owner.feeTotal)} · Coll: {formatRupee(deal.owner.feeCollected)}
                            {deal.owner.feeRemaining > 0 && (
                              <strong style={{ color: "#dc2626", marginLeft: 4 }}>
                                (Rem: {formatRupee(deal.owner.feeRemaining)})
                              </strong>
                            )}
                          </small>
                        </div>
                      </div>
                    </td>

                    {/* Home Seeker Details & Fee */}
                    <td>
                      <div className="party-ledger-cell">
                        <strong>{deal.seeker.name}</strong>
                        <span>
                          <Phone size={11} /> {deal.seeker.phone || "No phone"}
                        </span>
                        <div className="party-fee-badge-wrap">
                          <span className={`fee-status-badge fee-${deal.seeker.feeStatus}`}>
                            Seeker: {deal.seeker.feeStatus.toUpperCase()}
                          </span>
                          <small>
                            Due: {formatRupee(deal.seeker.feeTotal)} · Coll: {formatRupee(deal.seeker.feeCollected)}
                            {deal.seeker.feeRemaining > 0 && (
                              <strong style={{ color: "#dc2626", marginLeft: 4 }}>
                                (Rem: {formatRupee(deal.seeker.feeRemaining)})
                              </strong>
                            )}
                          </small>
                        </div>
                      </div>
                    </td>

                    {/* Security Deposit Details */}
                    <td>
                      <div className="deposit-ledger-cell">
                        <span className={`deposit-status-pill status-${deal.securityDeposit.status}`}>
                          {deal.securityDeposit.status === "collected" ? "Fully Collected" : "Pending Balance"}
                        </span>
                        <div className="deposit-numbers">
                          <span>Req: {formatRupee(deal.securityDeposit.total)}</span>
                          <span>Coll: {formatRupee(deal.securityDeposit.collected)}</span>
                          {deal.securityDeposit.remaining > 0 ? (
                            <strong className="deposit-remaining-alert">
                              Rem: {formatRupee(deal.securityDeposit.remaining)}
                            </strong>
                          ) : (
                            <strong style={{ color: "#059669" }}>Settled</strong>
                          )}
                        </div>
                      </div>
                    </td>

                    {/* Lease Dates */}
                    <td>
                      <div className="lease-dates-cell">
                        <span>
                          Start: {deal.leaseStartDate ? new Date(deal.leaseStartDate).toLocaleDateString("en-IN") : "Pending"}
                        </span>
                        <span>Tenure: {deal.stayDurationMonths} Months</span>
                        <small className="deal-status-pill">{deal.dealStatus.replace("_", " ")}</small>
                      </div>
                    </td>

                    {/* Action: Record Payment */}
                    <td style={{ textAlign: "right" }}>
                      <div className="row-actions-group">
                        <button
                          className="btn btn-sm btn-primary"
                          onClick={() => openPaymentForDeal(deal, deal.owner.feeRemaining > 0 ? "owner_brokerage" : "seeker_brokerage")}
                          title="Record payment for this deal"
                        >
                          <CreditCard size={13} />
                          <span>Record Payment</span>
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          TAB 4: ACCOUNT & REVENUE LEDGER
         ───────────────────────────────────────────────────────────── */}
      {activeTab === "ledger" && (
        <div className="tab-view-content">
          {/* Account Balance Summary Banner */}
          <div className="account-balance-hero">
            <div className="balance-hero-left">
              <span className="balance-eyebrow">NET SETTLED APNA AANGAN BALANCE</span>
              <h2 className="balance-figure">{formatRupee(kpis?.moneyInAccount.netCollected)}</h2>
              <span className="balance-sub">
                Audit Status: 100% Reconciled · Total Credits: {formatRupee(kpis?.moneyInAccount.totalCredits)} · Debits: {formatRupee(kpis?.moneyInAccount.totalDebits)}
              </span>
            </div>

            <div className="balance-hero-right">
              <button
                className="btn btn-primary"
                onClick={() => {
                  setSelectedDealForPayment(null);
                  setPaymentForm({
                    category: "owner_brokerage",
                    payerType: "owner",
                    payerName: "",
                    amount: "",
                    direction: "credit",
                    paymentMode: "upi",
                    referenceId: "",
                    notes: "",
                  });
                  setPaymentModalOpen(true);
                }}
              >
                <Plus size={15} /> + Record Transaction
              </button>
            </div>
          </div>

          <div className="table-controls-row">
            <div className="table-search-box">
              <Search size={15} />
              <input
                type="text"
                placeholder="Search transaction code, reference ID, or payer name..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button onClick={() => setSearchQuery("")} className="clear-btn">
                  <X size={13} />
                </button>
              )}
            </div>

            <div className="table-filter-chips">
              {[
                { key: "all", label: "All Categories" },
                { key: "owner_brokerage", label: "Owner Brokerage" },
                { key: "seeker_brokerage", label: "Seeker Fees" },
                { key: "security_deposit", label: "Security Deposits" },
                { key: "managed_listing_fee", label: "Managed Listing Fees" },
                { key: "refund_or_payout", label: "Refunds / Payouts" },
              ].map((f) => (
                <button
                  key={f.key}
                  className={`filter-chip-btn ${txnCategoryFilter === f.key ? "active" : ""}`}
                  onClick={() => setTxnCategoryFilter(f.key)}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="ledger-table-container">
            <table className="ledger-table">
              <thead>
                <tr>
                  <th>Date &amp; Time</th>
                  <th>Transaction Code &amp; Ref</th>
                  <th>Payer Details</th>
                  <th>Category</th>
                  <th>Mode</th>
                  <th>Amount</th>
                  <th>Running Account Balance</th>
                  <th>Reconciliation</th>
                  <th>Recorded By</th>
                </tr>
              </thead>
              <tbody>
                {filteredTransactions.map((txn) => (
                  <tr key={txn.id}>
                    <td>
                      <div className="date-cell">
                        <strong>{new Date(txn.createdAt).toLocaleDateString("en-IN", { day: "numeric", month: "short", year: "numeric" })}</strong>
                        <small>{new Date(txn.createdAt).toLocaleTimeString("en-IN", { hour: "2-digit", minute: "2-digit" })}</small>
                      </div>
                    </td>
                    <td>
                      <div className="txn-code-cell">
                        <strong>{txn.txnCode}</strong>
                        <span>{txn.referenceId || "Direct Ref"}</span>
                      </div>
                    </td>
                    <td>
                      <div className="payer-cell">
                        <strong>{txn.payerName}</strong>
                        <span className="payer-type-tag">{txn.payerType.toUpperCase()}</span>
                      </div>
                    </td>
                    <td>
                      <span className={`category-tag tag-${txn.category}`}>
                        {txn.category.replace(/_/g, " ").toUpperCase()}
                      </span>
                    </td>
                    <td>
                      <span className="mode-badge">{txn.paymentMode.toUpperCase()}</span>
                    </td>
                    <td>
                      <strong className={txn.direction === "credit" ? "amount-credit" : "amount-debit"}>
                        {txn.direction === "credit" ? "+ " : "- "}
                        {formatRupee(Number(txn.amount))}
                      </strong>
                    </td>
                    <td>
                      <strong className="running-balance-val">
                        {txn.runningBalance !== undefined ? formatRupee(txn.runningBalance) : "—"}
                      </strong>
                    </td>
                    <td>
                      <span className="reconciled-pill">
                        <CheckCircle2 size={11} /> {txn.reconciliationStatus}
                      </span>
                    </td>
                    <td>
                      <small className="admin-name-tag">{txn.recordedByAdminName || "System"}</small>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 1: RECORD PAYMENT / TRANSACTION
         ───────────────────────────────────────────────────────────── */}
      {paymentModalOpen && (
        <div
          className="ledger-modal-backdrop"
          onClick={() => setPaymentModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.72)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px 16px",
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          <div
            className="ledger-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 540,
              width: "100%",
              background: "#ffffff",
              color: "#0f172a",
              borderRadius: 20,
              border: "1px solid rgba(0, 0, 0, 0.08)",
              boxShadow: "0 25px 65px -12px rgba(15, 23, 42, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.06)",
              padding: "28px 32px",
              position: "relative",
              maxHeight: "calc(100vh - 48px)",
              overflowY: "auto",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div className="ledger-modal-header">
              <div>
                <h3>Record Payment / Transaction</h3>
                <p>Log verified cash, UPI, or bank deposit directly to the account ledger.</p>
              </div>
              <button type="button" className="ledger-modal-close" onClick={() => setPaymentModalOpen(false)} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>

            {selectedDealForPayment && (
              <div className="ledger-modal-banner">
                <strong>{selectedDealForPayment.property.title} ({selectedDealForPayment.dealCode})</strong>
                <small>Locality: {selectedDealForPayment.property.locality} · Monthly Rent: {formatRupee(selectedDealForPayment.monthlyRent)}</small>
              </div>
            )}

            <form onSubmit={handleRecordPayment} className="ledger-modal-form">
              <div className="ledger-form-grid">
                <label>
                  <span>Category *</span>
                  <select
                    value={paymentForm.category}
                    onChange={(e) => {
                      const cat = e.target.value as any;
                      setPaymentForm({
                        ...paymentForm,
                        category: cat,
                        payerType: cat === "owner_brokerage" ? "owner" : "seeker",
                        payerName:
                          selectedDealForPayment
                            ? cat === "owner_brokerage"
                              ? selectedDealForPayment.owner.name
                              : selectedDealForPayment.seeker.name
                            : paymentForm.payerName,
                      });
                    }}
                    required
                  >
                    <option value="owner_brokerage">Owner Brokerage / Fee</option>
                    <option value="seeker_brokerage">Home Seeker Fee</option>
                    <option value="security_deposit">Security Deposit</option>
                    <option value="managed_listing_fee">Managed Listing Fee (₹499/₹999)</option>
                    <option value="refund_or_payout">Refund / Payout (Debit)</option>
                  </select>
                </label>

                <label>
                  <span>Payer Role *</span>
                  <select
                    value={paymentForm.payerType}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payerType: e.target.value as any })}
                  >
                    <option value="owner">Owner</option>
                    <option value="seeker">Tenant / Seeker</option>
                    <option value="other">Other / Platform</option>
                  </select>
                </label>
              </div>

              <div className="ledger-form-grid">
                <label>
                  <span>Payer Full Name *</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ramesh Kumar"
                    value={paymentForm.payerName}
                    onChange={(e) => setPaymentForm({ ...paymentForm, payerName: e.target.value })}
                  />
                </label>

                <label>
                  <span>Amount (₹) *</span>
                  <input
                    type="number"
                    min="1"
                    step="1"
                    required
                    placeholder="e.g. 15000"
                    value={paymentForm.amount}
                    onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  />
                </label>
              </div>

              <div className="ledger-form-grid">
                <label>
                  <span>Payment Mode *</span>
                  <select
                    value={paymentForm.paymentMode}
                    onChange={(e) => setPaymentForm({ ...paymentForm, paymentMode: e.target.value })}
                  >
                    <option value="upi">UPI / GPay / PhonePe</option>
                    <option value="bank_transfer">Bank Transfer (NEFT/IMPS/RTGS)</option>
                    <option value="card">Credit / Debit Card</option>
                    <option value="cash">Cash Settlement</option>
                    <option value="cheque">Cheque</option>
                  </select>
                </label>

                <label>
                  <span>Reference ID / UTR</span>
                  <input
                    type="text"
                    placeholder="e.g. UPI/123456789 or NEFT-HDFC-9912"
                    value={paymentForm.referenceId}
                    onChange={(e) => setPaymentForm({ ...paymentForm, referenceId: e.target.value })}
                  />
                </label>
              </div>

              <label>
                <span>Direction</span>
                <select
                  value={paymentForm.direction}
                  onChange={(e) => setPaymentForm({ ...paymentForm, direction: e.target.value as any })}
                >
                  <option value="credit">Credit (+) Entering Account</option>
                  <option value="debit">Debit (-) Leaving Account / Refund</option>
                </select>
              </label>

              <label>
                <span>Audit Notes (Optional)</span>
                <textarea
                  rows={2}
                  placeholder="Additional context or agreement milestone notes..."
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                />
              </label>

              <div className="ledger-modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setPaymentModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit" disabled={submittingPayment}>
                  {submittingPayment ? "Recording..." : "Save & Reconcile Payment"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ─────────────────────────────────────────────────────────────
          MODAL 2: CREATE NEW RENTAL DEAL
         ───────────────────────────────────────────────────────────── */}
      {newDealModalOpen && (
        <div
          className="ledger-modal-backdrop"
          onClick={() => setNewDealModalOpen(false)}
          style={{
            position: "fixed",
            inset: 0,
            background: "rgba(15, 23, 42, 0.72)",
            backdropFilter: "blur(8px)",
            WebkitBackdropFilter: "blur(8px)",
            zIndex: 10000,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: "24px 16px",
            overflowY: "auto",
            boxSizing: "border-box",
          }}
        >
          <div
            className="ledger-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{
              maxWidth: 620,
              width: "100%",
              background: "#ffffff",
              color: "#0f172a",
              borderRadius: 20,
              border: "1px solid rgba(0, 0, 0, 0.08)",
              boxShadow: "0 25px 65px -12px rgba(15, 23, 42, 0.45), 0 0 0 1px rgba(0, 0, 0, 0.06)",
              padding: "28px 32px",
              position: "relative",
              maxHeight: "calc(100vh - 48px)",
              overflowY: "auto",
              boxSizing: "border-box",
              display: "flex",
              flexDirection: "column",
              gap: 20,
            }}
          >
            <div className="ledger-modal-header">
              <div>
                <h3>Create New Rental Deal</h3>
                <p>Link flat, owner, and tenant to track deposits, brokerage, and lease duration.</p>
              </div>
              <button type="button" className="ledger-modal-close" onClick={() => setNewDealModalOpen(false)} aria-label="Close modal">
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCreateDeal} className="ledger-modal-form">
              <label>
                <span>Select Flat / Property *</span>
                <select
                  value={newDealForm.propertyId}
                  onChange={(e) => {
                    const selected = inventory.find((i) => i.id === e.target.value);
                    setNewDealForm({
                      ...newDealForm,
                      propertyId: e.target.value,
                      monthlyRent: selected ? String(selected.monthlyRent) : newDealForm.monthlyRent,
                      securityDepositTotal: selected ? String(selected.deposit || selected.monthlyRent * 2) : newDealForm.securityDepositTotal,
                      ownerFeeTotal: selected ? String(selected.monthlyRent * 0.15) : newDealForm.ownerFeeTotal,
                      seekerFeeTotal: selected ? String(selected.monthlyRent * 0.15) : newDealForm.seekerFeeTotal,
                    });
                  }}
                  required
                >
                  {inventory.map((inv) => (
                    <option key={inv.id} value={inv.id}>
                      {inv.title} — {inv.locality} ({formatRupee(inv.monthlyRent)}/mo)
                    </option>
                  ))}
                </select>
              </label>

              <div className="ledger-form-grid">
                <label>
                  <span>Tenant / Seeker Full Name *</span>
                  <input
                    type="text"
                    required
                    placeholder="e.g. Ananya Sharma"
                    value={newDealForm.seekerName}
                    onChange={(e) => setNewDealForm({ ...newDealForm, seekerName: e.target.value })}
                  />
                </label>

                <label>
                  <span>Tenant Phone Number *</span>
                  <input
                    type="tel"
                    required
                    placeholder="e.g. 9811223344"
                    value={newDealForm.seekerPhone}
                    onChange={(e) => setNewDealForm({ ...newDealForm, seekerPhone: e.target.value })}
                  />
                </label>
              </div>

              <div className="ledger-form-grid">
                <label>
                  <span>Agreed Monthly Rent (₹) *</span>
                  <input
                    type="number"
                    required
                    placeholder="40000"
                    value={newDealForm.monthlyRent}
                    onChange={(e) => setNewDealForm({ ...newDealForm, monthlyRent: e.target.value })}
                  />
                </label>

                <label>
                  <span>Stay Duration (Months)</span>
                  <input
                    type="number"
                    placeholder="11"
                    value={newDealForm.stayDurationMonths}
                    onChange={(e) => setNewDealForm({ ...newDealForm, stayDurationMonths: e.target.value })}
                  />
                </label>
              </div>

              <div className="ledger-form-grid">
                <label>
                  <span>Total Security Deposit (₹) *</span>
                  <input
                    type="number"
                    required
                    placeholder="80000"
                    value={newDealForm.securityDepositTotal}
                    onChange={(e) => setNewDealForm({ ...newDealForm, securityDepositTotal: e.target.value })}
                  />
                </label>

                <label>
                  <span>Deposit Collected So Far (₹)</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={newDealForm.securityDepositCollected}
                    onChange={(e) => setNewDealForm({ ...newDealForm, securityDepositCollected: e.target.value })}
                  />
                </label>
              </div>

              <div className="ledger-form-grid">
                <label>
                  <span>Owner Brokerage Due (₹) *</span>
                  <input
                    type="number"
                    required
                    placeholder="15000"
                    value={newDealForm.ownerFeeTotal}
                    onChange={(e) => setNewDealForm({ ...newDealForm, ownerFeeTotal: e.target.value })}
                  />
                </label>

                <label>
                  <span>Owner Fee Collected (₹)</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={newDealForm.ownerFeeCollected}
                    onChange={(e) => setNewDealForm({ ...newDealForm, ownerFeeCollected: e.target.value })}
                  />
                </label>
              </div>

              <div className="ledger-form-grid">
                <label>
                  <span>Seeker Fee Due (₹) *</span>
                  <input
                    type="number"
                    required
                    placeholder="15000"
                    value={newDealForm.seekerFeeTotal}
                    onChange={(e) => setNewDealForm({ ...newDealForm, seekerFeeTotal: e.target.value })}
                  />
                </label>

                <label>
                  <span>Seeker Fee Collected (₹)</span>
                  <input
                    type="number"
                    placeholder="0"
                    value={newDealForm.seekerFeeCollected}
                    onChange={(e) => setNewDealForm({ ...newDealForm, seekerFeeCollected: e.target.value })}
                  />
                </label>
              </div>

              <label>
                <span>Deal Status</span>
                <select
                  value={newDealForm.dealStatus}
                  onChange={(e) => setNewDealForm({ ...newDealForm, dealStatus: e.target.value })}
                >
                  <option value="active_rented">Active Rented (Marks Flat as Rented)</option>
                  <option value="in_progress">Deal In Progress (Drafting Agreement)</option>
                </select>
              </label>

              <div className="ledger-modal-actions">
                <button type="button" className="btn-modal-cancel" onClick={() => setNewDealModalOpen(false)}>
                  Cancel
                </button>
                <button type="submit" className="btn-modal-submit" disabled={submittingDeal}>
                  {submittingDeal ? "Creating..." : "Create Deal & Update Flat"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

