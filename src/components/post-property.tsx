"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  BadgeCheck,
  Building2,
  Camera,
  Check,
  CheckCircle2,
  ChevronRight,
  CloudUpload,
  FileCheck2,
  FileText,
  Home,
  Image as ImageIcon,
  KeyRound,
  LockKeyhole,
  MapPin,
  Navigation,
  Plus,
  ShieldCheck,
  Sparkles,
  Trash2,
  Upload,
  User,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { apiFetch, useApp } from "@/components/providers";

const steps = [
  "Owner KYC",
  "Listing & location",
  "Property specs",
  "Pricing & terms",
  "Photos",
  "Review",
];

const categories = [
  { value: "buy_home", label: "Sell a home", description: "Apartment, villa, house or plot", icon: Home },
  { value: "rent_home", label: "Rent out a home", description: "Apartment, villa or house", icon: KeyRound },
  { value: "rent_pg", label: "List a PG / Co-living", description: "Room, PG or shared co-living", icon: UsersRound },
];

const propertyTypesByCategory: Record<string, string[]> = {
  buy_home: ["Apartment", "Independent house", "Villa", "Plot", "Commercial"],
  rent_home: ["Apartment", "Independent house", "Villa", "Commercial"],
  rent_pg: ["PG", "Co-living", "Room"],
};

const bhkOptions = ["1 RK", "1 BHK", "2 BHK", "3 BHK", "4 BHK", "4+ BHK", "Plot"];
const facingOptions = ["East", "North", "North-East", "South", "West", "North-West", "South-East", "South-West"];
const propertyAgeOptions = ["New / Under Construction", "0–1 Year", "1–5 Years", "5–10 Years", "10+ Years"];
const furnishingOptions = ["Unfurnished", "Semi-furnished", "Fully furnished"];
const tenantPreferenceOptions = ["Any (Family or Bachelors)", "Family only", "Bachelors only", "Company lease", "Vegetarians only"];
const lockInOptions = ["None", "3 months", "6 months", "11 months", "1 year"];
const noticePeriodOptions = ["15 days", "1 month", "2 months", "3 months"];
const bedCountOptions = ["Single Room (Private)", "2 Sharing", "3 Sharing", "4+ Sharing"];
const genderPolicyOptions = ["Boys only", "Girls only", "Unisex / Co-ed"];

const defaultHouseRules = [
  "No smoking inside",
  "No drinking inside",
  "Visitors allowed during daytime",
  "Overnight visitors allowed",
  "No loud music after 10 PM",
  "Curfew by 11:00 PM",
  "Pets allowed",
];

const amenityOptions = [
  "Covered Parking",
  "Balcony",
  "Power Backup",
  "Lift",
  "24x7 Security",
  "Wi-Fi",
  "Modular Kitchen",
  "Water Supply",
  "Gym",
  "Swimming Pool",
  "Park Nearby",
  "Meals Included",
  "Daily Housekeeping",
  "Laundry Service",
];

export type FormDataState = {
  // Step 1: Owner Info & KYC
  ownerPhone: string;
  ownerName: string;
  city: string;
  liveSelfieUrl: string;
  aadhaarCardUrl: string;
  ownershipType: "sole_owner" | "co_owner";
  coOwners: string;

  // Step 2: Listing Type & Property Address
  category: "buy_home" | "rent_home" | "rent_pg";
  address: string;
  pinCode: string;
  landmark: string;
  locality: string;
  latitude: string;
  longitude: string;

  // Step 3: Property Specs & Layout
  propertyType: string;
  bhkOrRoomType: string;
  areaSqft: string;
  floor: string;
  totalFloors: string;
  propertyAge: string;
  facing: string;
  furnishingStatus: string;
  amenities: string[];

  // Step 4: Pricing & Terms
  price: string;
  priceType: "fixed" | "negotiable";
  deposit: string;
  maintenanceStatus: "included" | "separate";
  maintenanceAmount: string;
  possessionStatus: string;
  possessionDate: string;
  loanStatus: string;
  reraNumber: string;
  lockInPeriod: string;
  noticePeriod: string;
  availableFrom: string;
  tenantPreference: string;
  // PG specifics
  bedCount: string;
  genderPolicy: string;
  foodCost: string;
  electricityCost: string;
  wifiCost: string;
  laundryCost: string;
  houseRules: string[];

  // Step 5: Photos (Minimum 5-6)
  images: string[];
};

const initial: FormDataState = {
  ownerPhone: "",
  ownerName: "",
  city: "Bengaluru",
  liveSelfieUrl: "",
  aadhaarCardUrl: "",
  ownershipType: "sole_owner",
  coOwners: "",

  category: "rent_home",
  address: "",
  pinCode: "",
  landmark: "",
  locality: "",
  latitude: "",
  longitude: "",

  propertyType: "Apartment",
  bhkOrRoomType: "2 BHK",
  areaSqft: "",
  floor: "1",
  totalFloors: "4",
  propertyAge: "1–5 Years",
  facing: "East",
  furnishingStatus: "Semi-furnished",
  amenities: ["Covered Parking", "Power Backup", "Lift", "Water Supply"],

  price: "",
  priceType: "fixed",
  deposit: "",
  maintenanceStatus: "included",
  maintenanceAmount: "",
  possessionStatus: "Ready to move",
  possessionDate: "",
  loanStatus: "No existing loan (Clear title)",
  reraNumber: "",
  lockInPeriod: "None",
  noticePeriod: "1 month",
  availableFrom: "",
  tenantPreference: "Any (Family or Bachelors)",

  bedCount: "2 Sharing",
  genderPolicy: "Unisex / Co-ed",
  foodCost: "Included",
  electricityCost: "As per meter",
  wifiCost: "Included",
  laundryCost: "Included",
  houseRules: ["No smoking inside", "Visitors allowed during daytime", "No loud music after 10 PM"],

  images: [],
};

async function compressImage(file: File): Promise<File> {
  if (file.size < 500000 && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
  try {
    let img: ImageBitmap | HTMLImageElement;
    let width = 0;
    let height = 0;
    if (typeof createImageBitmap === "function") {
      try {
        img = await createImageBitmap(file);
        width = img.width;
        height = img.height;
      } catch {
        img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          image.onload = () => resolve(image);
          image.onerror = reject;
          image.src = URL.createObjectURL(file);
        });
        width = img.width;
        height = img.height;
      }
    } else {
      img = await new Promise<HTMLImageElement>((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = URL.createObjectURL(file);
      });
      width = img.width;
      height = img.height;
    }

    const maxDim = 1600;
    const scale = Math.min(1, maxDim / Math.max(width, height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(width * scale));
    canvas.height = Math.max(1, Math.round(height * scale));
    const ctx = canvas.getContext("2d");
    if (!ctx) return file;
    ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
    if ("close" in img && typeof img.close === "function") img.close();

    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));
    if (!blob) return file;
    const cleanName = file.name.replace(/\.[^.]+$/, ".jpg");
    return new File([blob], cleanName, { type: "image/jpeg" });
  } catch {
    return file;
  }
}

export function PostPropertyExperience() {
  const { user, loading, refreshUser, toast } = useApp();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormDataState>(initial);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);
  const [uploadingAadhaar, setUploadingAadhaar] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [pinStatus, setPinStatus] = useState<string | null>(null);

  const selfieInputRef = useRef<HTMLInputElement>(null);
  const aadhaarInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);

  // Sync user profile data on load
  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,
        ownerPhone: prev.ownerPhone || (user.phone ? user.phone.replace(/^\+91/, "").replace(/\D/g, "").slice(0, 10) : ""),
        ownerName: prev.ownerName || user.name || "",
        city: prev.city || user.location || user.city || "Bengaluru",
      }));
    }
  }, [user]);

  // Load / Save draft in localStorage
  useEffect(() => {
    try {
      const saved = localStorage.getItem("aangan-property-draft-v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        setForm((old) => ({ ...old, ...parsed }));
      }
    } catch {
      // Ignore draft read errors
    }
  }, []);

  useEffect(() => {
    if (form.category) {
      localStorage.setItem("aangan-property-draft-v2", JSON.stringify(form));
    }
  }, [form]);

  function update(changes: Partial<FormDataState>) {
    setForm((old) => ({ ...old, ...changes }));
    setError("");
  }

  // Upload helpers
  async function handleUploadSingle(file: File, type: "selfie" | "aadhaar") {
    if (type === "selfie") setUploadingSelfie(true);
    if (type === "aadhaar") setUploadingAadhaar(true);
    setError("");
    try {
      const compressed = await compressImage(file);
      const payload = new FormData();
      payload.append("file", compressed);
      const data = await apiFetch<{ url: string }>("/api/uploads", { method: "POST", body: payload });
      if (data.url) {
        if (type === "selfie") update({ liveSelfieUrl: data.url });
        if (type === "aadhaar") update({ aadhaarCardUrl: data.url });
        toast(`${type === "selfie" ? "Selfie" : "Aadhaar card"} uploaded successfully!`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Failed to upload ${type}.`;
      setError(msg);
      toast(msg, "error");
    } finally {
      if (type === "selfie") setUploadingSelfie(false);
      if (type === "aadhaar") setUploadingAadhaar(false);
    }
  }

  async function handleUploadPhotos(files: FileList | null) {
    if (!files?.length) return;
    setUploadingPhotos(true);
    setError("");
    const remainingSlots = 15 - form.images.length;
    const toUpload = Array.from(files).slice(0, remainingSlots);
    let lastError = "";

    for (const file of toUpload) {
      try {
        const compressed = await compressImage(file);
        const payload = new FormData();
        payload.append("file", compressed);
        const data = await apiFetch<{ url: string }>("/api/uploads", { method: "POST", body: payload });
        if (data.url) {
          setForm((old) => ({ ...old, images: [...old.images, data.url] }));
        }
      } catch (err) {
        lastError = err instanceof Error ? err.message : "Couldn't upload photo.";
      }
    }

    if (lastError) setError(lastError);
    setUploadingPhotos(false);
    if (photosInputRef.current) photosInputRef.current.value = "";
  }

  // Geolocation detection
  function handleDetectPin() {
    setPinStatus("Detecting current coordinates...");
    if (typeof window === "undefined" || !("geolocation" in navigator)) {
      setPinStatus("Geolocation not supported by browser.");
      return;
    }
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const lat = pos.coords.latitude.toFixed(6);
        const lon = pos.coords.longitude.toFixed(6);
        update({ latitude: lat, longitude: lon });
        setPinStatus(`✓ Map pin captured: ${lat}° N, ${lon}° E`);
        toast("Location pin captured!");
      },
      (err) => {
        setPinStatus(`GPS error: ${err.message}. You can still proceed with address.`);
      },
      { timeout: 10000, enableHighAccuracy: true }
    );
  }

  // Step Validation
  function nextStep() {
    let message = "";

    // Step 0: Owner KYC
    if (step === 0) {
      const cleanPhone = form.ownerPhone.replace(/\D/g, "");
      if (!/^[6-9]\d{9}$/.test(cleanPhone)) {
        message = "Please enter a valid 10-digit Indian mobile number (starts with 6, 7, 8, or 9).";
      } else if (form.ownerName.trim().length < 2) {
        message = "Please enter your full legal name.";
      } else if (form.city.trim().length < 2) {
        message = "Please enter your current city.";
      } else if (!form.liveSelfieUrl) {
        message = "Please upload or capture a live selfie for owner verification.";
      } else if (!form.aadhaarCardUrl) {
        message = "Please upload your Aadhaar card photo for verification.";
      } else if (form.ownershipType === "co_owner" && form.coOwners.trim().length < 2) {
        message = "Please specify co-owner name(s) and details.";
      }
    }

    // Step 1: Listing & Location
    else if (step === 1) {
      if (!form.category) {
        message = "Please select a listing type (Sell / Rent / PG).";
      } else if (form.address.trim().length < 5) {
        message = "Please enter the full property address (at least 5 characters).";
      } else if (!/^\d{6}$/.test(form.pinCode.replace(/\D/g, ""))) {
        message = "Please enter a valid 6-digit Indian PIN code.";
      } else if (form.locality.trim().length < 2) {
        message = "Please enter the locality / area (e.g. Koramangala).";
      } else if (form.landmark.trim().length < 2) {
        message = "Please enter a nearby landmark (e.g. Near Metro Station).";
      }
    }

    // Step 2: Property Specs
    else if (step === 2) {
      if (!form.propertyType) {
        message = "Please select a property type.";
      } else if (!form.bhkOrRoomType) {
        message = "Please select BHK / room configuration.";
      } else if (!Number(form.areaSqft) || Number(form.areaSqft) < 1) {
        message = "Please enter a valid property area in sq ft.";
      }
    }

    // Step 3: Pricing & Terms
    else if (step === 3) {
      if (!Number(form.price) || Number(form.price) < 1) {
        message = form.category === "buy_home" ? "Please enter the asking price." : "Please enter the monthly rent.";
      } else if (form.category !== "buy_home" && (!Number(form.deposit) || Number(form.deposit) < 0)) {
        message = "Please specify the security deposit amount.";
      } else if (form.maintenanceStatus === "separate" && (!Number(form.maintenanceAmount) || Number(form.maintenanceAmount) < 1)) {
        message = "Please enter the monthly maintenance charges.";
      }
    }

    // Step 4: Photos (Minimum 5-6)
    else if (step === 4) {
      if (form.images.length < 5) {
        message = `Please upload at least 5 photos of the property (currently ${form.images.length}/5 added).`;
      }
    }

    if (message) {
      setError(message);
      return;
    }

    setError("");
    setStep((old) => Math.min(old + 1, steps.length - 1));
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // Final Form Submission
  async function submit() {
    setSubmitting(true);
    setError("");

    try {
      const cleanPrice = Math.round(Number(String(form.price).replace(/,/g, ""))) || 0;
      const cleanDeposit = form.deposit ? Math.round(Number(String(form.deposit).replace(/,/g, ""))) : null;
      const cleanArea = Math.round(Number(String(form.areaSqft).replace(/,/g, ""))) || 0;
      const cleanMaintenance = form.maintenanceStatus === "separate" ? Math.round(Number(String(form.maintenanceAmount).replace(/,/g, ""))) : null;

      // Auto-generated clear title & description (no manual typing required from user)
      const autoTitle = `${form.bhkOrRoomType} ${form.propertyType} in ${form.locality || form.landmark || form.city}`;
      const autoDescription = `${form.bhkOrRoomType} ${form.propertyType} with ${cleanArea} sq ft located in ${form.locality || form.city}. Floor: ${form.floor || "1"} of ${form.totalFloors || "4"}, Facing: ${form.facing}, Furnishing: ${form.furnishingStatus}. ${form.landmark ? `Landmark: ${form.landmark}.` : ""}`;

      const payload = {
        category: form.category,
        propertyType: form.propertyType,
        title: autoTitle,
        description: autoDescription,
        price: cleanPrice,
        priceType: form.priceType,
        deposit: cleanDeposit,
        address: form.address,
        city: form.city,
        locality: form.locality,
        pinCode: form.pinCode,
        landmark: form.landmark,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        bhkOrRoomType: form.bhkOrRoomType,
        areaSqft: cleanArea,
        bathrooms: form.bhkOrRoomType.includes("1") ? 1 : form.bhkOrRoomType.includes("2") ? 2 : 3,
        floor: form.floor,
        totalFloors: form.totalFloors ? Number(form.totalFloors) : null,
        propertyAge: form.propertyAge,
        facing: form.facing,
        furnishingStatus: form.furnishingStatus,
        amenities: form.amenities,
        images: form.images,
        // Owner KYC
        ownerName: form.ownerName,
        ownerPhone: form.ownerPhone,
        liveSelfieUrl: form.liveSelfieUrl,
        aadhaarCardUrl: form.aadhaarCardUrl,
        ownershipType: form.ownershipType,
        coOwners: form.coOwners || null,
        // Financials & Terms
        maintenanceStatus: form.maintenanceStatus,
        maintenanceAmount: cleanMaintenance,
        possessionStatus: form.possessionStatus,
        possessionDate: form.possessionDate ? new Date(form.possessionDate).toISOString() : null,
        loanStatus: form.loanStatus,
        reraNumber: form.reraNumber || null,
        lockInPeriod: form.lockInPeriod,
        noticePeriod: form.noticePeriod,
        availabilityDate: form.availableFrom ? new Date(form.availableFrom).toISOString() : null,
        tenantPreference: form.tenantPreference,
        // PG Details
        bedCount: form.category === "rent_pg" ? form.bedCount : null,
        genderPolicy: form.category === "rent_pg" ? form.genderPolicy : null,
        houseRules: form.houseRules,
        itemizedCharges: {
          food: form.foodCost,
          electricity: form.electricityCost,
          wifi: form.wifiCost,
          laundry: form.laundryCost,
        },
      };

      await apiFetch("/api/properties", { method: "POST", body: JSON.stringify(payload) });
      await refreshUser();
      localStorage.removeItem("aangan-property-draft-v2");
      toast("Your listing was submitted for verification!");
      router.push("/owner");
      router.refresh();
    } catch (problem) {
      const msg = problem instanceof Error ? problem.message : "Couldn't submit your listing.";
      setError(msg);
      toast(msg, "error");
    } finally {
      setSubmitting(false);
    }
  }

  async function upgrade() {
    if (!user?.phone) {
      router.push(`/setup?next=${encodeURIComponent("/post-property")}`);
      return;
    }
    try {
      await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify({ addOwnerRole: true }) });
      await refreshUser();
      toast("Owner tools activated");
    } catch {
      toast("Couldn't activate owner tools", "error");
    }
  }

  if (!loading && !user) {
    return (
      <main className="member-page">
        <div className="container">
          <div className="account-gate">
            <span><LockKeyhole size={30} /></span>
            <h2>Let&apos;s get your space listed.</h2>
            <p>Sign in first to share your property securely with the Aangan community.</p>
            <Link href="/login?next=/post-property" className="btn btn-primary">
              Log in to continue <ArrowRight size={17} />
            </Link>
          </div>
        </div>
      </main>
    );
  }

  if (!loading && user && !user.roles.includes("owner") && !user.roles.includes("admin")) {
    return (
      <main className="member-page">
        <div className="container">
          <div className="account-gate">
            <span><KeyRound size={30} /></span>
            <h2>Become an Aangan owner.</h2>
            <p>Activate your owner space to post a property and receive private, anonymous interest updates.</p>
            <button onClick={() => void upgrade()} className="btn btn-primary">
              Activate owner tools <ArrowRight size={17} />
            </button>
          </div>
        </div>
      </main>
    );
  }

  const currentCategory = categories.find((item) => item.value === form.category);
  const autoTitlePreview = `${form.bhkOrRoomType} ${form.propertyType} in ${form.locality || form.landmark || form.city}`;

  return (
    <main className="post-page">
      <div className="container">
        <div className="post-top">
          <Link href="/owner">
            <ArrowLeft size={17} /> Back to dashboard
          </Link>
          <span>
            <ShieldCheck size={16} /> Verified before going live
          </span>
        </div>

        <div className="post-heading">
          <span className="eyebrow">
            <span className="eyebrow-line" /> OWNER PROPERTY SUBMISSION
          </span>
          <h1>
            List your space with <em>clarity.</em>
          </h1>
          <p>Provide verified ownership &amp; property details. Our team audits every listing before it goes live.</p>
        </div>

        <div className="post-layout">
          {/* Stepper Navigation */}
          <aside className="post-stepper">
            <strong>LISTING STEPS</strong>
            {steps.map((label, index) => (
              <button
                key={label}
                className={`${index === step ? "active" : ""} ${index < step ? "complete" : ""}`}
                onClick={() => index < step && setStep(index)}
              >
                <span>{index < step ? <Check size={15} /> : String(index + 1).padStart(2, "0")}</span>
                {label}
              </button>
            ))}

            <div className="post-help">
              <Sparkles size={19} />
              <strong>100% Verified Listings</strong>
              <p>KYC documents and ownership proof protect both you and prospective seekers from spam.</p>
            </div>
          </aside>

          {/* Form Card */}
          <div className="post-form-card">
            <div className="post-form-top">
              <span>STEP {String(step + 1).padStart(2, "0")} OF {String(steps.length).padStart(2, "0")}</span>
              <span>{Math.round(((step + 1) / steps.length) * 100)}% COMPLETE</span>
            </div>

            <div className="post-progress">
              <span style={{ width: `${((step + 1) / steps.length) * 100}%` }} />
            </div>

            {/* ─────────────────────────────────────────────────────────────
                STEP 0: Owner Info & KYC Verification
               ───────────────────────────────────────────────────────────── */}
            {step === 0 && (
              <div className="post-step-content">
                <h2>Owner identity &amp; verification</h2>
                <p>Provide your contact details and mandatory KYC documents to verify ownership.</p>

                <div className="form-two-cols">
                  <div>
                    <label className="form-label" htmlFor="owner-name">
                      FULL NAME <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      id="owner-name"
                      className="form-input"
                      value={form.ownerName}
                      onChange={(e) => update({ ownerName: e.target.value })}
                      placeholder="e.g. Uday Maharshi"
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="owner-phone">
                      MOBILE NUMBER (10 DIGITS) <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <div className="phone-field">
                      <span>+91</span>
                      <input
                        id="owner-phone"
                        type="tel"
                        value={form.ownerPhone.replace(/\D/g, "").slice(0, 10)}
                        maxLength={10}
                        inputMode="numeric"
                        pattern="[6-9][0-9]{9}"
                        onChange={(e) => update({ ownerPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                        placeholder="9876543210"
                        required
                      />
                    </div>
                  </div>
                </div>

                <label className="form-label" htmlFor="owner-city" style={{ marginTop: "16px" }}>
                  YOUR CITY <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  id="owner-city"
                  className="form-input"
                  value={form.city}
                  onChange={(e) => update({ city: e.target.value })}
                  placeholder="e.g. Bengaluru, Mumbai, Delhi NCR"
                  required
                />

                {/* KYC Document Uploads */}
                <label className="form-label" style={{ marginTop: "22px" }}>
                  OWNER VERIFICATION DOCUMENTS <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <div className="kyc-upload-grid">
                  {/* Live Selfie */}
                  <div className={`kyc-upload-card ${form.liveSelfieUrl ? "is-uploaded" : ""}`}>
                    <input
                      ref={selfieInputRef}
                      type="file"
                      accept="image/*"
                      capture="user"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadSingle(file, "selfie");
                      }}
                    />
                    {form.liveSelfieUrl ? (
                      <>
                        <img src={form.liveSelfieUrl} alt="Owner live selfie" className="kyc-upload-preview" />
                        <span style={{ fontSize: "11px", color: "#10b981", fontWeight: 800 }}>✓ Live Selfie Uploaded</span>
                        <button
                          type="button"
                          className="kyc-remove-btn"
                          onClick={() => update({ liveSelfieUrl: "" })}
                        >
                          Change photo
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="kyc-card-icon"><Camera size={24} /></span>
                        <strong>Live Selfie Photo</strong>
                        <small>Take or upload a clear photo of yourself for owner verification.</small>
                        <button
                          type="button"
                          className="kyc-upload-btn"
                          disabled={uploadingSelfie}
                          onClick={() => selfieInputRef.current?.click()}
                        >
                          <Camera size={14} />
                          {uploadingSelfie ? "Uploading..." : "Take / Upload Selfie"}
                        </button>
                      </>
                    )}
                  </div>

                  {/* Aadhaar Card Photo */}
                  <div className={`kyc-upload-card ${form.aadhaarCardUrl ? "is-uploaded" : ""}`}>
                    <input
                      ref={aadhaarInputRef}
                      type="file"
                      accept="image/*,.pdf"
                      hidden
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) void handleUploadSingle(file, "aadhaar");
                      }}
                    />
                    {form.aadhaarCardUrl ? (
                      <>
                        <img src={form.aadhaarCardUrl} alt="Aadhaar card preview" className="kyc-upload-preview" />
                        <span style={{ fontSize: "11px", color: "#10b981", fontWeight: 800 }}>✓ Aadhaar Card Uploaded</span>
                        <button
                          type="button"
                          className="kyc-remove-btn"
                          onClick={() => update({ aadhaarCardUrl: "" })}
                        >
                          Change document
                        </button>
                      </>
                    ) : (
                      <>
                        <span className="kyc-card-icon"><FileCheck2 size={24} /></span>
                        <strong>Aadhaar Card Document</strong>
                        <small>Upload front/back photo of your Aadhaar for identity match.</small>
                        <button
                          type="button"
                          className="kyc-upload-btn"
                          disabled={uploadingAadhaar}
                          onClick={() => aadhaarInputRef.current?.click()}
                        >
                          <Upload size={14} />
                          {uploadingAadhaar ? "Uploading..." : "Upload Aadhaar"}
                        </button>
                      </>
                    )}
                  </div>
                </div>

                {/* Ownership Type */}
                <label className="form-label" style={{ marginTop: "18px" }}>
                  OWNERSHIP TYPE <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <div className="ownership-pill-row">
                  <button
                    type="button"
                    className={form.ownershipType === "sole_owner" ? "selected" : ""}
                    onClick={() => update({ ownershipType: "sole_owner" })}
                  >
                    Sole Owner
                  </button>
                  <button
                    type="button"
                    className={form.ownershipType === "co_owner" ? "selected" : ""}
                    onClick={() => update({ ownershipType: "co_owner" })}
                  >
                    Co-owners
                  </button>
                </div>

                {form.ownershipType === "co_owner" && (
                  <div style={{ marginTop: "10px" }}>
                    <label className="form-label" htmlFor="co-owners">
                      CO-OWNERS DETAILS <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      id="co-owners"
                      className="form-input"
                      value={form.coOwners}
                      onChange={(e) => update({ coOwners: e.target.value })}
                      placeholder="e.g. Ramesh Sharma (Co-owner / Spouse)"
                      required
                    />
                  </div>
                )}
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                STEP 1: Listing Type & Property Address
               ───────────────────────────────────────────────────────────── */}
            {step === 1 && (
              <div className="post-step-content">
                <h2>Listing type &amp; address</h2>
                <p>Tell us what kind of listing this is and its full physical location.</p>

                <label className="form-label">LISTING TYPE <span style={{ color: "#dc2626" }}>*</span></label>
                <div className="post-category-grid">
                  {categories.map(({ value, label, description, icon: Icon }) => (
                    <button
                      key={value}
                      type="button"
                      className={form.category === value ? "selected" : ""}
                      onClick={() => update({ category: value as any, propertyType: propertyTypesByCategory[value][0] })}
                    >
                      <Icon size={23} />
                      <strong>{label}</strong>
                      <small>{description}</small>
                      <span className="post-selected-check"><Check size={14} /></span>
                    </button>
                  ))}
                </div>

                <label className="form-label" htmlFor="post-address">
                  FULL ADDRESS <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  id="post-address"
                  className="form-input"
                  value={form.address}
                  onChange={(e) => update({ address: e.target.value })}
                  placeholder="Building name, Flat/Door number, Road, Sector"
                  required
                />

                <div className="form-two-cols" style={{ marginTop: "14px" }}>
                  <div>
                    <label className="form-label" htmlFor="post-pincode">
                      PIN CODE (6 DIGITS) <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      id="post-pincode"
                      className="form-input"
                      value={form.pinCode.replace(/\D/g, "").slice(0, 6)}
                      maxLength={6}
                      inputMode="numeric"
                      onChange={(e) => update({ pinCode: e.target.value.replace(/\D/g, "").slice(0, 6) })}
                      placeholder="e.g. 560034"
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="post-locality">
                      LOCALITY / AREA <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      id="post-locality"
                      className="form-input"
                      value={form.locality}
                      onChange={(e) => update({ locality: e.target.value })}
                      placeholder="e.g. Koramangala 4th Block"
                      required
                    />
                  </div>
                </div>

                <label className="form-label" htmlFor="post-landmark" style={{ marginTop: "14px" }}>
                  PROMINENT LANDMARK <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <input
                  id="post-landmark"
                  className="form-input"
                  value={form.landmark}
                  onChange={(e) => update({ landmark: e.target.value })}
                  placeholder="e.g. Opposite Forum Mall, Behind Metro Station"
                  required
                />

                {/* Map Pin Geolocation */}
                <label className="form-label" style={{ marginTop: "20px" }}>
                  MAP PIN (GEOLOCATION)
                </label>
                <div className="map-pin-action-box">
                  <div>
                    <strong>{form.latitude && form.longitude ? `📍 Pin set: ${form.latitude}° N, ${form.longitude}° E` : "Pin property location"}</strong>
                    <p style={{ margin: "4px 0 0", fontSize: "11px", color: "var(--muted)" }}>
                      {pinStatus || "Captures the exact coordinates for distance calculations without publishing owner details."}
                    </p>
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    style={{ padding: "9px 15px", fontSize: "11px", whiteSpace: "nowrap" }}
                    onClick={handleDetectPin}
                  >
                    <Navigation size={14} />
                    {form.latitude ? "Re-detect GPS Pin" : "Capture GPS Pin"}
                  </button>
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                STEP 2: Property Specs & Layout
               ───────────────────────────────────────────────────────────── */}
            {step === 2 && (
              <div className="post-step-content">
                <h2>Property specifications &amp; layout</h2>
                <p>Accurate specifications help the right tenant or buyer find your listing quickly.</p>

                <label className="form-label">PROPERTY TYPE <span style={{ color: "#dc2626" }}>*</span></label>
                <div className="choice-pill-row">
                  {propertyTypesByCategory[form.category]?.map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={form.propertyType === type ? "selected" : ""}
                      onClick={() => update({ propertyType: type })}
                    >
                      {type}
                    </button>
                  ))}
                </div>

                <label className="form-label" style={{ marginTop: "14px" }}>
                  BHK CONFIGURATION / ROOM TYPE <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <div className="choice-pill-row">
                  {bhkOptions.map((bhk) => (
                    <button
                      key={bhk}
                      type="button"
                      className={form.bhkOrRoomType === bhk ? "selected" : ""}
                      onClick={() => update({ bhkOrRoomType: bhk })}
                    >
                      {bhk}
                    </button>
                  ))}
                </div>

                <div className="form-two-cols" style={{ marginTop: "14px" }}>
                  <div>
                    <label className="form-label" htmlFor="area-sqft">
                      SUPER BUILT-UP AREA (SQ FT) <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      id="area-sqft"
                      className="form-input"
                      type="number"
                      min="1"
                      value={form.areaSqft}
                      onChange={(e) => update({ areaSqft: e.target.value })}
                      placeholder="e.g. 1250"
                      required
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="furnishing-status">
                      FURNISHING STATUS <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <select
                      id="furnishing-status"
                      className="form-input"
                      value={form.furnishingStatus}
                      onChange={(e) => update({ furnishingStatus: e.target.value })}
                    >
                      {furnishingOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <div className="form-two-cols" style={{ marginTop: "14px" }}>
                  <div>
                    <label className="form-label" htmlFor="property-floor">
                      UNIT FLOOR
                    </label>
                    <input
                      id="property-floor"
                      className="form-input"
                      value={form.floor}
                      onChange={(e) => update({ floor: e.target.value })}
                      placeholder="e.g. 3rd Floor, Ground"
                    />
                  </div>
                  <div>
                    <label className="form-label" htmlFor="total-floors">
                      TOTAL FLOORS IN BUILDING
                    </label>
                    <input
                      id="total-floors"
                      className="form-input"
                      type="number"
                      min="1"
                      value={form.totalFloors}
                      onChange={(e) => update({ totalFloors: e.target.value })}
                      placeholder="e.g. 5"
                    />
                  </div>
                </div>

                <div className="form-two-cols" style={{ marginTop: "14px" }}>
                  <div>
                    <label className="form-label">PROPERTY AGE</label>
                    <select
                      className="form-input"
                      value={form.propertyAge}
                      onChange={(e) => update({ propertyAge: e.target.value })}
                    >
                      {propertyAgeOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="form-label">FACING DIRECTION</label>
                    <select
                      className="form-input"
                      value={form.facing}
                      onChange={(e) => update({ facing: e.target.value })}
                    >
                      {facingOptions.map((opt) => (
                        <option key={opt} value={opt}>{opt}</option>
                      ))}
                    </select>
                  </div>
                </div>

                <label className="form-label" style={{ marginTop: "20px" }}>
                  KEY AMENITIES <small>(SELECT ALL THAT APPLY)</small>
                </label>
                <div className="amenity-choices">
                  {amenityOptions.map((item) => (
                    <button
                      key={item}
                      type="button"
                      className={form.amenities.includes(item) ? "selected" : ""}
                      onClick={() =>
                        update({
                          amenities: form.amenities.includes(item)
                            ? form.amenities.filter((a) => a !== item)
                            : [...form.amenities, item],
                        })
                      }
                    >
                      {form.amenities.includes(item) ? <Check size={14} /> : <Plus size={14} />} {item}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                STEP 3: Pricing & Terms (Dynamic by Listing Type)
               ───────────────────────────────────────────────────────────── */}
            {step === 3 && (
              <div className="post-step-content">
                <h2>Financials &amp; terms</h2>
                <p>Be transparent about pricing, maintenance, and possession terms.</p>

                {/* Sell Specifics */}
                {form.category === "buy_home" && (
                  <>
                    <div className="form-two-cols">
                      <div>
                        <label className="form-label" htmlFor="sell-price">
                          ASKING PRICE (₹) <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <input
                          id="sell-price"
                          className="form-input"
                          type="number"
                          min="1"
                          value={form.price}
                          onChange={(e) => update({ price: e.target.value })}
                          placeholder="e.g. 7500000"
                          required
                        />
                      </div>
                      <div>
                        <label className="form-label" htmlFor="price-type">
                          PRICE TYPE
                        </label>
                        <select
                          id="price-type"
                          className="form-input"
                          value={form.priceType}
                          onChange={(e) => update({ priceType: e.target.value as any })}
                        >
                          <option value="fixed">Fixed</option>
                          <option value="negotiable">Negotiable</option>
                        </select>
                      </div>
                    </div>

                    <div className="form-two-cols" style={{ marginTop: "14px" }}>
                      <div>
                        <label className="form-label">
                          POSSESSION STATUS <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <select
                          className="form-input"
                          value={form.possessionStatus}
                          onChange={(e) => update({ possessionStatus: e.target.value })}
                        >
                          <option value="Ready to move">Ready to move</option>
                          <option value="Under construction">Under construction</option>
                        </select>
                      </div>
                      <div>
                        <label className="form-label">POSSESSION / AVAILABLE DATE</label>
                        <input
                          className="form-input"
                          type="date"
                          value={form.possessionDate}
                          onChange={(e) => update({ possessionDate: e.target.value })}
                        />
                      </div>
                    </div>

                    <div className="form-two-cols" style={{ marginTop: "14px" }}>
                      <div>
                        <label className="form-label">LOAN / MORTGAGE STATUS</label>
                        <select
                          className="form-input"
                          value={form.loanStatus}
                          onChange={(e) => update({ loanStatus: e.target.value })}
                        >
                          <option value="No existing loan (Clear title)">No existing loan (Clear title)</option>
                          <option value="Existing home loan / mortgage">Existing home loan / mortgage</option>
                          <option value="Bank pre-approved project">Bank pre-approved project</option>
                        </select>
                      </div>
                      <div>
                        <label className="form-label">RERA NUMBER <small>(OPTIONAL)</small></label>
                        <input
                          className="form-input"
                          value={form.reraNumber}
                          onChange={(e) => update({ reraNumber: e.target.value })}
                          placeholder="PRM/KA/RERA/..."
                        />
                      </div>
                    </div>
                  </>
                )}

                {/* Rent Specifics */}
                {form.category === "rent_home" && (
                  <>
                    <div className="form-two-cols">
                      <div>
                        <label className="form-label" htmlFor="rent-price">
                          MONTHLY RENT (₹) <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <input
                          id="rent-price"
                          className="form-input"
                          type="number"
                          min="1"
                          value={form.price}
                          onChange={(e) => update({ price: e.target.value })}
                          placeholder="e.g. 35000"
                          required
                        />
                      </div>
                      <div>
                        <label className="form-label" htmlFor="rent-deposit">
                          SECURITY DEPOSIT (₹) <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <input
                          id="rent-deposit"
                          className="form-input"
                          type="number"
                          min="0"
                          value={form.deposit}
                          onChange={(e) => update({ deposit: e.target.value })}
                          placeholder="e.g. 100000"
                          required
                        />
                      </div>
                    </div>

                    <div className="form-two-cols" style={{ marginTop: "14px" }}>
                      <div>
                        <label className="form-label">AVAILABLE FROM</label>
                        <input
                          className="form-input"
                          type="date"
                          value={form.availableFrom}
                          onChange={(e) => update({ availableFrom: e.target.value })}
                        />
                      </div>
                      <div>
                        <label className="form-label">TENANT PREFERENCE</label>
                        <select
                          className="form-input"
                          value={form.tenantPreference}
                          onChange={(e) => update({ tenantPreference: e.target.value })}
                        >
                          {tenantPreferenceOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <div className="form-two-cols" style={{ marginTop: "14px" }}>
                      <div>
                        <label className="form-label">LOCK-IN PERIOD</label>
                        <select
                          className="form-input"
                          value={form.lockInPeriod}
                          onChange={(e) => update({ lockInPeriod: e.target.value })}
                        >
                          {lockInOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="form-label">NOTICE PERIOD</label>
                        <select
                          className="form-input"
                          value={form.noticePeriod}
                          onChange={(e) => update({ noticePeriod: e.target.value })}
                        >
                          {noticePeriodOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </>
                )}

                {/* PG Specifics */}
                {form.category === "rent_pg" && (
                  <>
                    <div className="form-two-cols">
                      <div>
                        <label className="form-label">
                          MONTHLY RENT PER BED / ROOM (₹) <span style={{ color: "#dc2626" }}>*</span>
                        </label>
                        <input
                          className="form-input"
                          type="number"
                          min="1"
                          value={form.price}
                          onChange={(e) => update({ price: e.target.value })}
                          placeholder="e.g. 12000"
                          required
                        />
                      </div>
                      <div>
                        <label className="form-label">SECURITY DEPOSIT (₹)</label>
                        <input
                          className="form-input"
                          type="number"
                          min="0"
                          value={form.deposit}
                          onChange={(e) => update({ deposit: e.target.value })}
                          placeholder="e.g. 20000"
                        />
                      </div>
                    </div>

                    <div className="form-two-cols" style={{ marginTop: "14px" }}>
                      <div>
                        <label className="form-label">BED COUNT / SHARING</label>
                        <select
                          className="form-input"
                          value={form.bedCount}
                          onChange={(e) => update({ bedCount: e.target.value })}
                        >
                          {bedCountOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label className="form-label">GENDER POLICY</label>
                        <select
                          className="form-input"
                          value={form.genderPolicy}
                          onChange={(e) => update({ genderPolicy: e.target.value })}
                        >
                          {genderPolicyOptions.map((opt) => (
                            <option key={opt} value={opt}>{opt}</option>
                          ))}
                        </select>
                      </div>
                    </div>

                    <label className="form-label" style={{ marginTop: "18px" }}>
                      ITEMIZED MONTHLY COSTS
                    </label>
                    <div className="itemized-cost-grid">
                      <div>
                        <label className="form-label" style={{ fontSize: "10px" }}>FOOD / MEALS</label>
                        <input
                          className="form-input"
                          value={form.foodCost}
                          onChange={(e) => update({ foodCost: e.target.value })}
                          placeholder="e.g. Included (3 meals) / Optional ₹3000"
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: "10px" }}>ELECTRICITY</label>
                        <input
                          className="form-input"
                          value={form.electricityCost}
                          onChange={(e) => update({ electricityCost: e.target.value })}
                          placeholder="e.g. Included / As per sub-meter"
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: "10px" }}>WI-FI / INTERNET</label>
                        <input
                          className="form-input"
                          value={form.wifiCost}
                          onChange={(e) => update({ wifiCost: e.target.value })}
                          placeholder="e.g. Included (High speed)"
                        />
                      </div>
                      <div>
                        <label className="form-label" style={{ fontSize: "10px" }}>LAUNDRY</label>
                        <input
                          className="form-input"
                          value={form.laundryCost}
                          onChange={(e) => update({ laundryCost: e.target.value })}
                          placeholder="e.g. Included / ₹100 per load"
                        />
                      </div>
                    </div>

                    <label className="form-label" style={{ marginTop: "16px" }}>
                      HOUSE RULES <small>(SELECT APPLICABLE RULES)</small>
                    </label>
                    <div className="house-rules-grid">
                      {defaultHouseRules.map((rule) => (
                        <button
                          key={rule}
                          type="button"
                          className={form.houseRules.includes(rule) ? "selected" : ""}
                          onClick={() =>
                            update({
                              houseRules: form.houseRules.includes(rule)
                                ? form.houseRules.filter((r) => r !== rule)
                                : [...form.houseRules, rule],
                            })
                          }
                        >
                          {form.houseRules.includes(rule) ? <Check size={13} /> : <Plus size={13} />}
                          {rule}
                        </button>
                      ))}
                    </div>
                  </>
                )}

                {/* Maintenance Charges for All */}
                <label className="form-label" style={{ marginTop: "18px" }}>
                  MAINTENANCE CHARGES <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <div className="ownership-pill-row">
                  <button
                    type="button"
                    className={form.maintenanceStatus === "included" ? "selected" : ""}
                    onClick={() => update({ maintenanceStatus: "included" })}
                  >
                    Included in Price / Rent
                  </button>
                  <button
                    type="button"
                    className={form.maintenanceStatus === "separate" ? "selected" : ""}
                    onClick={() => update({ maintenanceStatus: "separate" })}
                  >
                    Separate Monthly Maintenance
                  </button>
                </div>

                {form.maintenanceStatus === "separate" && (
                  <div style={{ marginTop: "8px" }}>
                    <label className="form-label" htmlFor="maint-amt">
                      MONTHLY MAINTENANCE CHARGES (₹) <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      id="maint-amt"
                      className="form-input"
                      type="number"
                      min="1"
                      value={form.maintenanceAmount}
                      onChange={(e) => update({ maintenanceAmount: e.target.value })}
                      placeholder="e.g. 3500"
                      required
                    />
                  </div>
                )}
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                STEP 4: Property Photos (Minimum 5-6 Enforced)
               ───────────────────────────────────────────────────────────── */}
            {step === 4 && (
              <div className="post-step-content">
                <h2>Property photos</h2>
                <p>High-quality photos attract authentic seekers. Minimum 5–6 photos required.</p>

                {/* Minimum photo count requirement indicator */}
                <div className={`photo-count-badge ${form.images.length >= 5 ? "success" : "warning"}`}>
                  {form.images.length >= 5 ? <CheckCircle2 size={15} /> : <Sparkles size={15} />}
                  <span>
                    {form.images.length >= 5
                      ? `✓ ${form.images.length} photos added — Minimum photo requirement met!`
                      : `Minimum 5 photos required (currently ${form.images.length}/5 added)`}
                  </span>
                </div>

                <input
                  ref={photosInputRef}
                  type="file"
                  accept="image/jpeg,image/png,image/webp,image/heic,.jpg,.jpeg,.png,.webp"
                  multiple
                  hidden
                  onChange={(e) => void handleUploadPhotos(e.target.files)}
                />

                <button
                  type="button"
                  className="upload-zone"
                  disabled={uploadingPhotos || form.images.length >= 15}
                  onClick={() => photosInputRef.current?.click()}
                >
                  <span><CloudUpload size={29} /></span>
                  <strong>{uploadingPhotos ? "Uploading your photos..." : "Click or drag to upload property photos"}</strong>
                  <small>JPG, PNG, WebP · Minimum 5 photos, up to 15 photos allowed</small>
                </button>

                {form.images.length > 0 && (
                  <div className="uploaded-grid">
                    {form.images.map((image, index) => (
                      <div key={`${image}-${index}`}>
                        <img src={image} alt={`Property photo ${index + 1}`} />
                        {index === 0 && <span>Cover photo</span>}
                        <button
                          type="button"
                          onClick={() => update({ images: form.images.filter((_, photoIndex) => photoIndex !== index) })}
                          aria-label={`Remove photo ${index + 1}`}
                        >
                          <Trash2 size={15} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* ─────────────────────────────────────────────────────────────
                STEP 5: Review & Final Submission
               ───────────────────────────────────────────────────────────── */}
            {step === 5 && (
              <div className="post-step-content">
                <h2>Review &amp; submit</h2>
                <p>Please double-check your property details before submitting for verification.</p>

                <div className="post-review-card">
                  {form.images[0] && <img src={form.images[0]} alt="Listing cover" />}
                  <div>
                    <span>{currentCategory?.label} · {form.propertyType}</span>
                    <h3>{autoTitlePreview}</h3>
                    <p><MapPin size={15} /> {form.locality}, {form.city} (PIN: {form.pinCode})</p>
                    <strong>
                      ₹{Number(form.price).toLocaleString("en-IN")}
                      {form.category !== "buy_home" ? "/month" : ""}
                    </strong>
                  </div>
                </div>

                <div className="review-list">
                  <div>
                    <span>Owner Name</span>
                    <strong>{form.ownerName}</strong>
                  </div>
                  <div>
                    <span>Owner Phone</span>
                    <strong>+91 {form.ownerPhone}</strong>
                  </div>
                  <div>
                    <span>Ownership</span>
                    <strong>{form.ownershipType === "sole_owner" ? "Sole Owner" : `Co-owners (${form.coOwners})`}</strong>
                  </div>
                  <div>
                    <span>KYC Verification</span>
                    <strong style={{ color: "#10b981" }}>Live Selfie &amp; Aadhaar Attached ✓</strong>
                  </div>
                  <div>
                    <span>Full Address</span>
                    <strong>{form.address}, Landmark: {form.landmark}</strong>
                  </div>
                  <div>
                    <span>Configuration</span>
                    <strong>{form.bhkOrRoomType} ({form.areaSqft} sq ft)</strong>
                  </div>
                  <div>
                    <span>Floor / Total</span>
                    <strong>{form.floor} / {form.totalFloors} floors</strong>
                  </div>
                  <div>
                    <span>Furnishing &amp; Facing</span>
                    <strong>{form.furnishingStatus} · {form.facing} facing</strong>
                  </div>
                  <div>
                    <span>Maintenance</span>
                    <strong>{form.maintenanceStatus === "included" ? "Included" : `₹${form.maintenanceAmount}/mo separate`}</strong>
                  </div>
                  {form.category === "buy_home" && (
                    <div>
                      <span>Possession &amp; Loan</span>
                      <strong>{form.possessionStatus} · {form.loanStatus}</strong>
                    </div>
                  )}
                  {form.category === "rent_home" && (
                    <div>
                      <span>Deposit &amp; Preference</span>
                      <strong>Deposit ₹{Number(form.deposit).toLocaleString("en-IN")} · {form.tenantPreference}</strong>
                    </div>
                  )}
                  {form.category === "rent_pg" && (
                    <div>
                      <span>PG Policy &amp; Bed Count</span>
                      <strong>{form.genderPolicy} · {form.bedCount}</strong>
                    </div>
                  )}
                  <div>
                    <span>Photos</span>
                    <strong style={{ color: "#10b981" }}>{form.images.length} verified photos attached</strong>
                  </div>
                </div>

                <div className="review-assurance">
                  <BadgeCheck size={24} />
                  <div>
                    <strong>Verified first. Live second.</strong>
                    <p>
                      Our verification team will review your property details and ownership KYC documents before
                      publishing to search. No private owner contact details are ever revealed to seekers.
                    </p>
                  </div>
                </div>
              </div>
            )}

            {/* Error Message */}
            {error && (
              <div className="form-error" role="alert" style={{ marginTop: "18px" }}>
                {error}
              </div>
            )}

            {/* Footer Navigation */}
            <div className="post-form-footer">
              {step > 0 ? (
                <button
                  type="button"
                  className="post-back"
                  onClick={() => {
                    setStep(step - 1);
                    setError("");
                  }}
                >
                  <ArrowLeft size={17} /> Previous
                </button>
              ) : (
                <span />
              )}

              <button
                type="button"
                className="btn btn-primary"
                disabled={submitting || uploadingSelfie || uploadingAadhaar || uploadingPhotos}
                onClick={() => (step === steps.length - 1 ? void submit() : nextStep())}
              >
                {step === steps.length - 1
                  ? submitting
                    ? "Submitting for verification..."
                    : "Submit for verification"
                  : "Continue"}
                {step === steps.length - 1 ? <Check size={17} /> : <ArrowRight size={17} />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </main>
  );
}
