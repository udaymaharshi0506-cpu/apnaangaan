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
  ChevronLeft,
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
  Save,
  ShieldCheck,
  Sparkles,
  Star,
  Trash2,
  Upload,
  User,
  Users,
  UsersRound,
  X,
} from "lucide-react";
import { apiFetch, isNetworkDropError, useApp } from "@/components/providers";
import { detectContactInfo, findFirstContactViolation } from "@/lib/contact-filter";
import { extractIndianPhoneDigits, normalizeWhitespace, parseIndianPhone, parseIndianPinCode } from "@/lib/input-validation";
import {
  getCanvasTransformForExif,
  MAX_IMAGE_COUNT,
  readJpegExifOrientation,
  validateImageUploadBytes,
} from "@/lib/image-validation";
import {
  BHK_OPTIONS_BY_VERTICAL,
  LISTING_LIMITS,
  MAX_LISTING_IMAGES,
  normalizeFromAllowlist,
  PROPERTY_TYPES_BY_VERTICAL,
  validateVerticalRules,
} from "@/lib/listing-validation";

const steps = [
  "Owner KYC",
  "Listing & location",
  "Property specs",
  "Pricing & terms",
  "Photos",
  "Review",
];

const categories = [
  { value: "rent_home", label: "Rent out a home", description: "Apartment, villa, independent house or floor", icon: KeyRound },
];

const propertyTypesByCategory: Record<string, readonly string[]> = {
  ...PROPERTY_TYPES_BY_VERTICAL,
  buy_home: PROPERTY_TYPES_BY_VERTICAL.rent_home,
  rent_pg: PROPERTY_TYPES_BY_VERTICAL.rent_home,
  commercial: PROPERTY_TYPES_BY_VERTICAL.rent_home,
};
const bhkOptions = [...BHK_OPTIONS_BY_VERTICAL.rent_home];
const facingOptions = ["East", "North", "North-East", "South", "West", "North-West", "South-East", "South-West"];
const propertyAgeOptions = ["New / Under Construction", "0–1 Year", "1–5 Years", "5–10 Years", "10+ Years"];
const furnishingOptions = ["Unfurnished", "Semi-furnished", "Fully furnished"];
const tenantPreferenceOptions = ["Any (Family or Bachelors)", "Family only", "Bachelors only", "Company lease", "Vegetarians only"];
const lockInOptions = ["None", "3 months", "6 months", "11 months", "1 year"];
const noticePeriodOptions = ["15 days", "1 month", "2 months", "3 months"];
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
  category: "rent_home";
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

  houseRules: ["No smoking inside", "Visitors allowed during daytime", "No loud music after 10 PM"],

  images: [],
};

async function processImageForUpload(file: File): Promise<File> {
  const headerBuf = new Uint8Array(await file.slice(0, 65536).arrayBuffer());
  const validation = validateImageUploadBytes(headerBuf, file.size);
  if (!validation.valid) {
    throw new Error(validation.error);
  }

  const orientation = validation.format.mime === "image/jpeg" ? readJpegExifOrientation(headerBuf) : 1;

  let img: ImageBitmap | HTMLImageElement;
  let width = 0;
  let height = 0;
  let manualTransformNeeded = true;

  if (typeof createImageBitmap === "function") {
    try {
      // Request raw orientation so we apply deterministic EXIF canvas transform below.
      img = await createImageBitmap(file, { imageOrientation: "none" });
      width = img.width;
      height = img.height;
    } catch {
      try {
        img = await createImageBitmap(file);
        width = img.width;
        height = img.height;
        manualTransformNeeded = false;
      } catch {
        img = await new Promise<HTMLImageElement>((resolve, reject) => {
          const image = new Image();
          const objectUrl = URL.createObjectURL(file);
          image.onload = () => {
            URL.revokeObjectURL(objectUrl);
            resolve(image);
          };
          image.onerror = () => {
            URL.revokeObjectURL(objectUrl);
            reject(new Error("Could not decode image."));
          };
          image.src = objectUrl;
        });
        width = img.width;
        height = img.height;
        manualTransformNeeded = false;
      }
    }
  } else {
    img = await new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new Image();
      const objectUrl = URL.createObjectURL(file);
      image.onload = () => {
        URL.revokeObjectURL(objectUrl);
        resolve(image);
      };
      image.onerror = () => {
        URL.revokeObjectURL(objectUrl);
        reject(new Error("Could not decode image."));
      };
      image.src = objectUrl;
    });
    width = img.width;
    height = img.height;
    manualTransformNeeded = false;
  }

  const maxDim = 1600;
  const oriented = manualTransformNeeded
    ? getCanvasTransformForExif(orientation, width, height)
    : { canvasWidth: width, canvasHeight: height, transform: [1, 0, 0, 1, 0, 0] as [number, number, number, number, number, number] };

  const scale = Math.min(1, maxDim / Math.max(oriented.canvasWidth, oriented.canvasHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(oriented.canvasWidth * scale));
  canvas.height = Math.max(1, Math.round(oriented.canvasHeight * scale));
  const ctx = canvas.getContext("2d");
  if (!ctx) return file;

  ctx.scale(scale, scale);
  ctx.transform(...oriented.transform);
  ctx.drawImage(img, 0, 0, width, height);
  if ("close" in img && typeof img.close === "function") img.close();

  const webpBlob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/webp", 0.82));
  const targetBlob =
    webpBlob && webpBlob.type === "image/webp"
      ? webpBlob
      : await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, "image/jpeg", 0.82));

  if (!targetBlob) return file;
  const ext = targetBlob.type === "image/webp" ? ".webp" : ".jpg";
  const cleanName = file.name.replace(/\.[^.]+$/, "") + ext;
  return new File([targetBlob], cleanName, { type: targetBlob.type });
}

export function PostPropertyExperience() {
  const { user, loading, refreshUser, toast } = useApp();
  const router = useRouter();

  const [step, setStep] = useState(0);
  const [form, setForm] = useState<FormDataState>(initial);
  const [editId, setEditId] = useState<string | null>(null);
  const [editingStatus, setEditingStatus] = useState<string | null>(null);
  const [loadingEdit, setLoadingEdit] = useState(false);
  const [uploadingSelfie, setUploadingSelfie] = useState(false);
  const [uploadingAadhaar, setUploadingAadhaar] = useState(false);
  const [uploadingPhotos, setUploadingPhotos] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [savingDraft, setSavingDraft] = useState(false);
  const [upgradingOwner, setUpgradingOwner] = useState(false);
  const [failedSingleUpload, setFailedSingleUpload] = useState<{ type: "selfie" | "aadhaar"; file: File; reason: string } | null>(null);
  const [failedPhotoUploads, setFailedPhotoUploads] = useState<Array<{ file: File; reason: string }>>([]);
  const [lastSubmitAction, setLastSubmitAction] = useState<"draft" | "submit" | null>(null);
  const [error, setError] = useState("");
  const [pinStatus, setPinStatus] = useState<string | null>(null);

  // Managed Service & Listing Mode States
  const [listingFlowMode, setListingFlowMode] = useState<"choose_mode" | "choose_tier" | "self_form" | "managed_success">("choose_mode");
  const [selectedTier, setSelectedTier] = useState<"standard" | "premium">("premium");
  const [showCheckoutModal, setShowCheckoutModal] = useState(false);
  const [submittingManagerRequest, setSubmittingManagerRequest] = useState(false);
  const [managedSuccessData, setManagedSuccessData] = useState<{
    id: string;
    transactionId: string;
    tier: "standard" | "premium";
    fee: string;
  } | null>(null);
  const [managedForm, setManagedForm] = useState({
    propertyTitle: "",
    locality: "",
    city: "Bengaluru",
    ownerContactPhone: "",
    notes: "",
    paymentMethod: "upi",
  });

  const submitLockRef = useRef(false);
  const selfieInputRef = useRef<HTMLInputElement>(null);
  const aadhaarInputRef = useRef<HTMLInputElement>(null);
  const photosInputRef = useRef<HTMLInputElement>(null);

  // Sync user profile data on load
  useEffect(() => {
    if (user) {
      setForm((prev) => ({
        ...prev,
        ownerPhone: prev.ownerPhone || (user.phone ? extractIndianPhoneDigits(user.phone) : ""),
        ownerName: prev.ownerName || user.name || "",
        city: prev.city || user.location || user.city || "Bengaluru",
      }));
      setManagedForm((prev) => ({
        ...prev,
        ownerContactPhone: prev.ownerContactPhone || (user.phone ? extractIndianPhoneDigits(user.phone) : ""),
        city: prev.city || user.location || user.city || "Bengaluru",
      }));
    }
  }, [user]);

  // Load existing listing when ?edit=<id> is provided; otherwise restore localStorage draft
  useEffect(() => {
    const searchParams = typeof window !== "undefined" ? new URLSearchParams(window.location.search) : null;
    const id = searchParams?.get("edit");
    const mode = searchParams?.get("mode");
    if (id) {
      setListingFlowMode("self_form");
      setEditId(id);
      setLoadingEdit(true);
      apiFetch<{ property: Record<string, any> }>(`/api/owner/properties/${id}`)
        .then(({ property: prop }) => {
          setEditingStatus(prop.status || null);
          setForm({
            ownerPhone: (prop.ownerPhone || "").replace(/^\+91/, "").replace(/\D/g, "").slice(0, 10),
            ownerName: prop.ownerName || "",
            city: prop.city || "Bengaluru",
            liveSelfieUrl: prop.liveSelfieUrl || "",
            aadhaarCardUrl: prop.aadhaarCardUrl || "",
            ownershipType: prop.ownershipType === "co_owner" ? "co_owner" : "sole_owner",
            coOwners: prop.coOwners || "",
            category: "rent_home",
            address: prop.address === "Draft address pending" ? "" : prop.address || "",
            pinCode: prop.pinCode || "",
            landmark: prop.landmark || "",
            locality: prop.locality === "Draft location" ? "" : prop.locality || "",
            latitude: prop.latitude != null ? String(prop.latitude) : "",
            longitude: prop.longitude != null ? String(prop.longitude) : "",
            propertyType: prop.propertyType || "Apartment",
            bhkOrRoomType: prop.bhkOrRoomType || "2 BHK",
            areaSqft: prop.areaSqft != null ? String(prop.areaSqft) : "",
            floor: prop.floor || "1",
            totalFloors: prop.totalFloors != null ? String(prop.totalFloors) : "4",
            propertyAge: prop.propertyAge || "1–5 Years",
            facing: prop.facing || "East",
            furnishingStatus: prop.furnishingStatus || "Semi-furnished",
            amenities: Array.isArray(prop.amenities) ? prop.amenities : [],
            price: prop.price != null ? String(prop.price) : "",
            priceType: prop.priceType === "negotiable" ? "negotiable" : "fixed",
            deposit: prop.deposit != null ? String(prop.deposit) : "",
            maintenanceStatus: prop.maintenanceStatus === "separate" ? "separate" : "included",
            maintenanceAmount: prop.maintenanceAmount != null ? String(prop.maintenanceAmount) : "",
            possessionStatus: "Ready to move",
            possessionDate: "",
            loanStatus: "No existing loan (Clear title)",
            reraNumber: prop.reraNumber || "",
            lockInPeriod: prop.lockInPeriod || "None",
            noticePeriod: prop.noticePeriod || "1 month",
            availableFrom: prop.availabilityDate ? String(prop.availabilityDate).slice(0, 10) : "",
            tenantPreference: prop.tenantPreference || "Any (Family or Bachelors)",
            houseRules: Array.isArray(prop.houseRules) ? prop.houseRules : [],
            images: Array.isArray(prop.images) ? prop.images : [],
          });
        })
        .catch(() => {
          toast("Couldn't load listing for editing", "error");
        })
        .finally(() => setLoadingEdit(false));
      return;
    }

    try {
      const saved = localStorage.getItem("aangan-property-draft-v2");
      if (saved) {
        const parsed = JSON.parse(saved);
        // Cleanse legacy category & vertical types
        const cleanPropertyType =
          normalizeFromAllowlist(parsed.propertyType || "", PROPERTY_TYPES_BY_VERTICAL.rent_home) || "Apartment";
        const cleanBhk =
          normalizeFromAllowlist(parsed.bhkOrRoomType || "", BHK_OPTIONS_BY_VERTICAL.rent_home) || "2 BHK";

        setForm((old) => ({
          ...old,
          ...parsed,
          category: "rent_home",
          propertyType: cleanPropertyType,
          bhkOrRoomType: cleanBhk,
        }));
      }
    } catch {
      // Ignore draft read errors
    }
  }, [toast]);

  // Ensure form.category is always strictly 'rent_home' even if an old draft had a legacy vertical
  useEffect(() => {
    if (form.category !== "rent_home") {
      setForm((old) => ({ ...old, category: "rent_home" }));
    }
  }, [form.category]);

  useEffect(() => {
    if (!editId) {
      localStorage.setItem("aangan-property-draft-v2", JSON.stringify({ ...form, category: "rent_home" }));
    }
  }, [form, editId]);

  function update(changes: Partial<FormDataState>) {
    setForm((old) => ({ ...old, ...changes, category: "rent_home" }));
    setError("");
  }

  function movePhoto(index: number, delta: -1 | 1) {
    const nextIdx = index + delta;
    if (nextIdx < 0 || nextIdx >= form.images.length) return;
    const copy = [...form.images];
    const [picked] = copy.splice(index, 1);
    copy.splice(nextIdx, 0, picked);
    update({ images: copy });
  }

  function makeCoverPhoto(index: number) {
    if (index <= 0 || index >= form.images.length) return;
    const copy = [...form.images];
    const [picked] = copy.splice(index, 1);
    copy.unshift(picked);
    update({ images: copy });
  }

  // Upload helpers
  async function handleUploadSingle(file: File, type: "selfie" | "aadhaar") {
    if ((type === "selfie" && uploadingSelfie) || (type === "aadhaar" && uploadingAadhaar)) return;
    if (type === "selfie") setUploadingSelfie(true);
    if (type === "aadhaar") setUploadingAadhaar(true);
    setError("");
    setFailedSingleUpload((prev) => (prev?.type === type ? null : prev));
    try {
      const processed = await processImageForUpload(file);
      const payload = new FormData();
      payload.append("file", processed);
      const data = await apiFetch<{ url: string }>("/api/uploads", { method: "POST", body: payload });
      if (data.url) {
        if (type === "selfie") update({ liveSelfieUrl: data.url });
        if (type === "aadhaar") update({ aadhaarCardUrl: data.url });
        toast(`${type === "selfie" ? "Selfie" : "Aadhaar card"} uploaded successfully!`);
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : `Network dropped while uploading ${type}. Please tap Retry.`;
      setFailedSingleUpload({ type, file, reason: msg });
      setError(msg);
      toast(msg, "error");
    } finally {
      if (type === "selfie") setUploadingSelfie(false);
      if (type === "aadhaar") setUploadingAadhaar(false);
      if (type === "selfie" && selfieInputRef.current) selfieInputRef.current.value = "";
      if (type === "aadhaar" && aadhaarInputRef.current) aadhaarInputRef.current.value = "";
    }
  }

  async function uploadPhotoBatch(filesToUpload: File[]) {
    const remainingSlots = MAX_IMAGE_COUNT - form.images.length;
    if (remainingSlots <= 0) {
      const msg = `Maximum ${MAX_IMAGE_COUNT} photos allowed per listing.`;
      setError(msg);
      toast(msg, "error");
      if (photosInputRef.current) photosInputRef.current.value = "";
      return;
    }

    setUploadingPhotos(true);
    setError("");
    if (filesToUpload.length > remainingSlots) {
      toast(`Only ${remainingSlots} more photo(s) can be added (max ${MAX_IMAGE_COUNT}).`, "error");
    }
    const toUpload = filesToUpload.slice(0, remainingSlots);
    let currentCount = form.images.length;
    const failures: Array<{ file: File; reason: string }> = [];

    for (const file of toUpload) {
      try {
        const processed = await processImageForUpload(file);
        const payload = new FormData();
        payload.append("file", processed);
        payload.append("existingCount", String(currentCount));
        const data = await apiFetch<{ url: string }>("/api/uploads", { method: "POST", body: payload });
        if (data.url) {
          currentCount += 1;
          setForm((old) => ({ ...old, images: [...old.images, data.url] }));
        }
      } catch (err) {
        const reason = err instanceof Error ? err.message : "Network connection dropped mid-upload.";
        failures.push({ file, reason });
      }
    }

    setFailedPhotoUploads(failures);
    if (failures.length > 0) {
      const summary = `${failures.length} photo(s) failed to upload (${failures[0].reason}). Tap Retry failed uploads.`;
      setError(summary);
      toast(summary, "error");
    }
    setUploadingPhotos(false);
    if (photosInputRef.current) photosInputRef.current.value = "";
  }

  async function handleUploadPhotos(files: FileList | null) {
    if (!files?.length || uploadingPhotos) return;
    await uploadPhotoBatch(Array.from(files));
  }

  async function retryFailedPhotos() {
    if (uploadingPhotos || failedPhotoUploads.length === 0) return;
    const retryFiles = failedPhotoUploads.map((item) => item.file);
    await uploadPhotoBatch(retryFiles);
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
      const phoneCheck = parseIndianPhone(form.ownerPhone);
      if (!phoneCheck.valid) {
        message = phoneCheck.error;
      } else if (normalizeWhitespace(form.ownerName).length < 2) {
        message = "Please enter your full legal name (at least 2 characters).";
      } else if (normalizeWhitespace(form.city).length < 2) {
        message = "Please enter your current city.";
      } else if (detectContactInfo(normalizeWhitespace(form.city)).blocked) {
        message = "City cannot contain phone numbers, emails, WhatsApp mentions, or external links.";
      } else if (!form.liveSelfieUrl) {
        message = "Please upload or capture a live selfie for owner verification.";
      } else if (!form.aadhaarCardUrl) {
        message = "Please upload your Aadhaar card photo for verification.";
      } else if (form.ownershipType === "co_owner" && normalizeWhitespace(form.coOwners).length < 2) {
        message = "Please specify co-owner name(s) and details.";
      }
    }

    // Step 1: Listing & Location
    else if (step === 1) {
      const pinCheck = parseIndianPinCode(form.pinCode);
      if (!form.category) {
        message = "Please select a listing type.";
      } else if (normalizeWhitespace(form.address).length < 5) {
        message = "Please enter the full property address (at least 5 characters).";
      } else if (!pinCheck.valid) {
        message = pinCheck.error;
      } else if (normalizeWhitespace(form.locality).length < 2) {
        message = "Please enter the locality / area (e.g. Mansarovar).";
      } else if (normalizeWhitespace(form.landmark).length < 2) {
        message = "Please enter a nearby landmark (e.g. Near Metro Station).";
      } else {
        const contactViolation = findFirstContactViolation(form, ["address", "locality", "landmark"]);
        if (contactViolation) {
          message = `${contactViolation.field}: ${contactViolation.reason}`;
        }
      }
    }

    // Step 2: Property Specs
    else if (step === 2) {
      const stepErr = validateVerticalRules(
        {
          category: "rent_home",
          propertyType: form.propertyType || "Apartment",
          bhkOrRoomType: form.bhkOrRoomType || "2 BHK",
          areaSqft: form.areaSqft,
          floor: form.floor,
          totalFloors: form.totalFloors,
          price: form.price || LISTING_LIMITS.rent_home.minPrice,
        },
        { isDraft: false }
      );
      if (stepErr) message = stepErr;
    }

    // Step 3: Pricing & Terms
    else if (step === 3) {
      const stepErr = validateVerticalRules(
        {
          category: "rent_home",
          propertyType: form.propertyType || "Apartment",
          bhkOrRoomType: form.bhkOrRoomType || "2 BHK",
          areaSqft: form.areaSqft || LISTING_LIMITS.rent_home.minAreaSqft,
          price: form.price,
          deposit: form.deposit,
          maintenanceStatus: form.maintenanceStatus,
          maintenanceAmount: form.maintenanceAmount,
        },
        { isDraft: false }
      );
      if (stepErr) {
        message = stepErr;
      } else if (form.deposit.trim() === "") {
        message = "Please specify the security deposit amount (enter 0 if none).";
      }
    }

    // Step 4: Photos (Minimum 5, Maximum 15)
    else if (step === 4) {
      if (form.images.length < 5) {
        message = `Please upload at least 5 photos of the property (currently ${form.images.length}/5 added).`;
      } else if (form.images.length > MAX_LISTING_IMAGES) {
        message = `Maximum ${MAX_LISTING_IMAGES} property photos allowed.`;
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

  function buildPayload(asDraft: boolean) {
    const cleanPriceStr = String(form.price).replace(/,/g, "").trim();
    const cleanDepositStr = String(form.deposit).replace(/,/g, "").trim();
    const cleanAreaStr = String(form.areaSqft).replace(/,/g, "").trim();
    const cleanMaintStr = String(form.maintenanceAmount).replace(/,/g, "").trim();

    const cleanAddress = normalizeWhitespace(form.address);
    const cleanCity = normalizeWhitespace(form.city);
    const cleanLocality = normalizeWhitespace(form.locality);
    const cleanLandmark = normalizeWhitespace(form.landmark);
    const cleanOwnerName = normalizeWhitespace(form.ownerName);
    const cleanCoOwners = normalizeWhitespace(form.coOwners);
    const cleanRera = normalizeWhitespace(form.reraNumber);
    const cleanFloor = normalizeWhitespace(form.floor);
    const cleanPin = normalizeWhitespace(form.pinCode).replace(/\s+/g, "");
    const phoneCheck = parseIndianPhone(form.ownerPhone);
    const cleanOwnerPhone = phoneCheck.valid ? phoneCheck.e164 : normalizeWhitespace(form.ownerPhone);

    const cleanPrice = cleanPriceStr ? Number(cleanPriceStr) : (asDraft ? undefined : 0);
    const cleanDeposit = cleanDepositStr ? Number(cleanDepositStr) : null;
    const cleanArea = cleanAreaStr ? Number(cleanAreaStr) : (asDraft ? undefined : 0);
    const cleanMaintenance = form.maintenanceStatus === "separate" && cleanMaintStr ? Number(cleanMaintStr) : null;

    const autoTitle = `${form.bhkOrRoomType || "2 BHK"} ${form.propertyType || "Apartment"} in ${cleanLocality || cleanLandmark || cleanCity || "Jaipur"}`;
    const autoDescription = `${form.bhkOrRoomType || "2 BHK"} ${form.propertyType || "Apartment"} featuring ${cleanArea || 1000} sq ft of space in ${cleanLocality || cleanCity || "Jaipur"}. Floor ${cleanFloor || "1"} of ${form.totalFloors.trim() || "4"}, ${form.facing} facing, ${form.furnishingStatus}. ${cleanLandmark ? `Landmark: ${cleanLandmark}.` : ""}`.trim();

    return {
      autoTitle,
      autoDescription,
      payload: {
        category: "rent_home" as const,
        propertyType: form.propertyType || "Apartment",
        title: autoTitle,
        description: autoDescription,
        ...(cleanPrice !== undefined ? { price: cleanPrice } : {}),
        priceType: form.priceType,
        deposit: cleanDeposit,
        address: cleanAddress,
        city: cleanCity,
        locality: cleanLocality,
        pinCode: cleanPin || null,
        landmark: cleanLandmark || null,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        bhkOrRoomType: form.bhkOrRoomType,
        ...(cleanArea !== undefined ? { areaSqft: cleanArea } : {}),
        bathrooms: form.bhkOrRoomType.includes("1") ? 1 : form.bhkOrRoomType.includes("2") ? 2 : 3,
        floor: cleanFloor || null,
        totalFloors: form.totalFloors.trim() ? Number(form.totalFloors.trim()) : null,
        propertyAge: form.propertyAge,
        facing: form.facing,
        furnishingStatus: form.furnishingStatus,
        amenities: form.amenities,
        images: form.images,
        ownerName: cleanOwnerName,
        ownerPhone: cleanOwnerPhone,
        liveSelfieUrl: form.liveSelfieUrl || null,
        aadhaarCardUrl: form.aadhaarCardUrl || null,
        ownershipType: form.ownershipType,
        coOwners: form.ownershipType === "co_owner" && cleanCoOwners ? cleanCoOwners : null,
        maintenanceStatus: form.maintenanceStatus || "included",
        maintenanceAmount: cleanMaintenance,
        possessionStatus: null,
        possessionDate: null,
        loanStatus: null,
        reraNumber: cleanRera || null,
        lockInPeriod: form.lockInPeriod || null,
        noticePeriod: form.noticePeriod || null,
        availabilityDate: form.availableFrom ? new Date(form.availableFrom).toISOString() : null,
        tenantPreference: form.tenantPreference || null,
        bedCount: null,
        genderPolicy: null,
        houseRules: form.houseRules || [],
        itemizedCharges: {},
        ...(asDraft ? { status: "draft" } : editId && editingStatus === "draft" ? { status: "pending_review" } : {}),
      },
    };
  }

  async function saveDraft() {
    if (submitLockRef.current || savingDraft || submitting) return;
    submitLockRef.current = true;
    setSavingDraft(true);
    setError("");
    setLastSubmitAction(null);
    try {
      const { payload } = buildPayload(true);
      const draftValidationErr = validateVerticalRules(payload, { isDraft: true });
      if (draftValidationErr) {
        setError(draftValidationErr);
        toast(draftValidationErr, "error");
        return;
      }
      const textViolation = findFirstContactViolation(
        { address: payload.address, city: payload.city, locality: payload.locality, landmark: payload.landmark },
        ["address", "city", "locality", "landmark"]
      );
      if (textViolation) {
        setError(`${textViolation.field}: ${textViolation.reason}`);
        toast(textViolation.reason, "error");
        return;
      }

      if (editId) {
        await apiFetch(`/api/properties/${editId}`, { method: "PATCH", body: JSON.stringify(payload) });
      } else {
        await apiFetch("/api/properties", { method: "POST", body: JSON.stringify(payload) });
        localStorage.removeItem("aangan-property-draft-v2");
      }
      await refreshUser();
      toast("Draft saved to your owner dashboard");
      router.push("/owner");
      router.refresh();
    } catch (problem) {
      const msg = problem instanceof Error ? problem.message : "Network connection dropped while saving draft. Please tap Retry.";
      if (isNetworkDropError(problem)) setLastSubmitAction("draft");
      setError(msg);
      toast(msg, "error");
    } finally {
      submitLockRef.current = false;
      setSavingDraft(false);
    }
  }

  // Final Form Submission
  async function submit() {
    if (submitLockRef.current || submitting || savingDraft) return;
    submitLockRef.current = true;
    setSubmitting(true);
    setError("");
    setLastSubmitAction(null);

    try {
      const { autoTitle, autoDescription, payload } = buildPayload(false);
      const fullErr = validateVerticalRules(payload, { isDraft: false, requireMinUiPhotos: true });
      if (fullErr) {
        setError(fullErr);
        toast(fullErr, "error");
        return;
      }

      const textViolation = findFirstContactViolation(
        {
          title: autoTitle,
          description: autoDescription,
          address: payload.address,
          city: payload.city,
          locality: payload.locality,
          landmark: payload.landmark,
        },
        ["title", "description", "address", "city", "locality", "landmark"]
      );
      if (textViolation) {
        setError(`${textViolation.field}: ${textViolation.reason}`);
        return;
      }

      if (editId) {
        await apiFetch(`/api/properties/${editId}`, { method: "PATCH", body: JSON.stringify(payload) });
        toast("Changes submitted for admin re-verification!");
      } else {
        await apiFetch("/api/properties", { method: "POST", body: JSON.stringify(payload) });
        localStorage.removeItem("aangan-property-draft-v2");
        toast("Your listing was submitted for verification!");
      }
      await refreshUser();
      router.push("/owner");
      router.refresh();
    } catch (problem) {
      const msg = problem instanceof Error ? problem.message : "Network connection dropped while submitting. Your details are saved — please tap Retry.";
      if (isNetworkDropError(problem)) setLastSubmitAction("submit");
      setError(msg);
      toast(msg, "error");
    } finally {
      submitLockRef.current = false;
      setSubmitting(false);
    }
  }

  async function upgrade() {
    if (submitLockRef.current || upgradingOwner) return;
    if (!user?.phone) {
      router.push(`/setup?next=${encodeURIComponent("/post-property")}`);
      return;
    }
    submitLockRef.current = true;
    setUpgradingOwner(true);
    try {
      await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify({ addOwnerRole: true }) });
      await refreshUser();
      toast("Owner tools activated");
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't activate owner tools. Please try again.", "error");
    } finally {
      submitLockRef.current = false;
      setUpgradingOwner(false);
    }
  }

  function handleSelectSelfListing() {
    setListingFlowMode("self_form");
    toast("Self-Listing mode selected. Fill in your property details below.", "info");
  }

  async function submitManagerRequest(e?: React.FormEvent) {
    if (e) e.preventDefault();
    if (submittingManagerRequest) return;
    if (!managedForm.locality.trim()) {
      toast("Please enter your property locality or area.", "error");
      return;
    }
    setSubmittingManagerRequest(true);
    const fee = selectedTier === "premium" ? "999.00" : "499.00";
    const tierDisplay = selectedTier === "premium" ? "Premium Listing (₹999)" : "Standard Listing (₹499)";
    try {
      const data = await apiFetch<{ request: any; message: string }>("/api/owner/manager-requests", {
        method: "POST",
        body: JSON.stringify({
          managedTier: selectedTier,
          feeAmount: fee,
          propertyTitle: managedForm.propertyTitle.trim() || undefined,
          locality: managedForm.locality.trim(),
          city: managedForm.city.trim() || undefined,
          ownerContactPhone: managedForm.ownerContactPhone.trim() || undefined,
          notes: managedForm.notes.trim() || undefined,
        }),
      });

      setShowCheckoutModal(false);
      setManagedSuccessData({
        id: data.request.id,
        transactionId: data.request.transactionId || `TXN_MGR_${Date.now().toString().slice(-6)}`,
        tier: selectedTier,
        fee,
      });
      setListingFlowMode("managed_success");
      toast(`Hire a Manager request (${tierDisplay}) confirmed! An Apna Aangan manager will reach out shortly.`);
    } catch (err) {
      toast(err instanceof Error ? err.message : "Couldn't submit manager request. Please try again.", "error");
    } finally {
      setSubmittingManagerRequest(false);
    }
  }

  if (!loading && !user) {
    return (
      <main className="member-page">
        <div className="container">
          <div className="account-gate">
            <span><LockKeyhole size={30} /></span>
            <h2>Let&apos;s get your space listed.</h2>
            <p>Sign in first to share your property securely with the Apnaangaan community.</p>
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
            <h2>Become an Apnaangaan owner.</h2>
            <p>Activate your owner space to post a property and receive private, anonymous interest updates.</p>
            <button onClick={() => void upgrade()} disabled={upgradingOwner} className="btn btn-primary">
              {upgradingOwner ? "Activating..." : "Activate owner tools"} <ArrowRight size={17} />
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

        {/* ─────────────────────────────────────────────────────────────
            STEP 1: Choose Listing Mode (Self vs. Managed)
           ───────────────────────────────────────────────────────────── */}
        {listingFlowMode === "choose_mode" && (
          <div className="owner-listing-mode-wrapper">
            <div className="post-heading" style={{ textAlign: "center", margin: "24px auto 36px", maxWidth: "700px" }}>
              <span className="eyebrow" style={{ justifyContent: "center" }}>
                <Sparkles size={14} /> APNA AANGAN OWNER LISTING OPTIONS
              </span>
              <h1>
                How would you like to <em>list your property?</em>
              </h1>
              <p>Choose whether to self-manage your listing details or have a dedicated Apna Aangan manager handle everything for you.</p>
            </div>

            <div className="listing-mode-grid">
              {/* Option 1: Do It Yourself */}
              <div className="listing-mode-card" onClick={handleSelectSelfListing}>
                <span className="mode-badge mode-badge-free">Self-Service · Free</span>
                <div className="mode-icon-wrap">
                  <FileText size={30} />
                </div>
                <h3>Do It Yourself (Self-Listing)</h3>
                <p className="mode-desc">
                  Fill in your property details, photos, and pricing yourself at your own pace.
                </p>
                <ul className="mode-bullets">
                  <li>
                    <Check size={16} /> Direct access to our full 6-step property builder
                  </li>
                  <li>
                    <Check size={16} /> Upload 5+ photos and specify exact amenities
                  </li>
                  <li>
                    <Check size={16} /> Zero listing fees · 100% self-managed
                  </li>
                </ul>
                <button type="button" className="btn btn-outline btn-full" onClick={handleSelectSelfListing}>
                  Start Self-Listing <ArrowRight size={16} />
                </button>
              </div>

              {/* Option 2: Hire a Manager */}
              <div className="listing-mode-card listing-mode-card-managed" onClick={() => setListingFlowMode("choose_tier")}>
                <span className="mode-badge mode-badge-managed">✨ Handled For You</span>
                <div className="mode-icon-wrap mode-icon-managed">
                  <Sparkles size={30} />
                </div>
                <h3>Hire a Manager (Managed Listing)</h3>
                <p className="mode-desc">
                  Let an Apna Aangan manager handle your property listing for you.
                </p>
                <ul className="mode-bullets">
                  <li>
                    <Check size={16} /> Dedicated manager reaches out to gather your property specs
                  </li>
                  <li>
                    <Check size={16} /> Professional listing formatting, curation, and verification
                  </li>
                  <li>
                    <Check size={16} /> Standard (₹499) and Premium Recommended (₹999) tiers available
                  </li>
                </ul>
                <button
                  type="button"
                  className="btn btn-primary btn-full"
                  onClick={(e) => {
                    e.stopPropagation();
                    setListingFlowMode("choose_tier");
                  }}
                >
                  Hire a Manager <ArrowRight size={16} />
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            STEP 2: Choose Managed Listing Tier (Standard vs. Premium)
           ───────────────────────────────────────────────────────────── */}
        {listingFlowMode === "choose_tier" && (
          <div className="owner-tier-selection-wrapper">
            <button type="button" className="back-to-mode-btn" onClick={() => setListingFlowMode("choose_mode")}>
              <ArrowLeft size={16} /> Back to listing options
            </button>

            <div className="post-heading" style={{ textAlign: "center", margin: "14px auto 36px", maxWidth: "720px" }}>
              <span className="eyebrow" style={{ justifyContent: "center" }}>
                <ShieldCheck size={14} /> DEDICATED PROPERTY MANAGEMENT
              </span>
              <h1>
                Choose Your <em>Managed Listing Tier</em>
              </h1>
              <p>Select the tier that fits your needs. Our managers handle tenant inquiries and coordinate viewings directly on your behalf.</p>
            </div>

            <div className="tier-comparison-grid">
              {/* Tier 1: Standard Listing — ₹499 */}
              <div className={`tier-card ${selectedTier === "standard" ? "tier-card-active" : ""}`}>
                <div className="tier-header">
                  <span className="tier-pill tier-pill-standard">Standard Service</span>
                  <h3>Standard Listing</h3>
                  <div className="tier-price">
                    <span className="tier-currency">₹</span>
                    <span className="tier-amount">499</span>
                    <span className="tier-period">/ one-time fee</span>
                  </div>
                  <p className="tier-summary">Direct listing by a manager using the details you share.</p>
                </div>

                <div className="tier-deliverables">
                  <h4>What&apos;s included:</h4>
                  <ul>
                    <li>
                      <Check size={16} className="tier-check" />
                      <span><strong>Direct listing by a manager:</strong> A manager uploads and publishes your listing from details you provide.</span>
                    </li>
                    <li>
                      <Check size={16} className="tier-check" />
                      <span><strong>Standard search placement:</strong> Listed prominently among verified residential rentals.</span>
                    </li>
                    <li>
                      <Check size={16} className="tier-check" />
                      <span><strong>Phone/WhatsApp coordination:</strong> Quick briefing to collect photos and key terms.</span>
                    </li>
                    <li className="tier-excluded">
                      <X size={16} className="tier-cross" />
                      <span>No full property verification, optimization, or extra checks included.</span>
                    </li>
                  </ul>
                </div>

                <div className="tier-footer">
                  <button
                    type="button"
                    className="btn btn-outline btn-full tier-cta-btn"
                    onClick={() => {
                      setSelectedTier("standard");
                      setShowCheckoutModal(true);
                    }}
                  >
                    Continue with Standard — ₹499
                  </button>
                </div>
              </div>

              {/* Tier 2: Premium Listing — ₹999 (Recommended) */}
              <div className={`tier-card tier-card-recommended ${selectedTier === "premium" ? "tier-card-active" : ""}`}>
                <div className="tier-recommended-ribbon">
                  <Star size={13} fill="currentColor" /> RECOMMENDED
                </div>
                <div className="tier-header">
                  <span className="tier-pill tier-pill-premium">⭐ Recommended Full Concierge</span>
                  <h3>Premium Listing</h3>
                  <div className="tier-price">
                    <span className="tier-currency">₹</span>
                    <span className="tier-amount">999</span>
                    <span className="tier-period">/ one-time payment</span>
                  </div>
                  <p className="tier-summary">Complete verification, photographic polish, and priority recommended boost.</p>
                </div>

                <div className="tier-deliverables">
                  <h4>What&apos;s included:</h4>
                  <ul>
                    <li>
                      <Check size={16} className="tier-check" />
                      <span><strong>Complete property check:</strong> Thorough verification of all listing specifications and ownership.</span>
                    </li>
                    <li>
                      <Check size={16} className="tier-check" />
                      <span><strong>Manager updates &amp; polish:</strong> Manager updates, polishes, and optimizes photos, description, and listing data.</span>
                    </li>
                    <li>
                      <Check size={16} className="tier-check" />
                      <span><strong>Priority &amp; &ldquo;Recommended&rdquo; Boost:</strong> Highlighted placement across the Apna Aangan website.</span>
                    </li>
                    <li>
                      <Check size={16} className="tier-check" />
                      <span><strong>Dedicated manager assignment:</strong> Fast-track manager assignment within 2 business hours.</span>
                    </li>
                  </ul>
                </div>

                <div className="tier-footer">
                  <button
                    type="button"
                    className="btn btn-primary btn-full tier-cta-btn"
                    onClick={() => {
                      setSelectedTier("premium");
                      setShowCheckoutModal(true);
                    }}
                  >
                    Continue with Premium — ₹999
                  </button>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            MANAGED SUCCESS CONFIRMATION
           ───────────────────────────────────────────────────────────── */}
        {listingFlowMode === "managed_success" && managedSuccessData && (
          <div className="managed-success-card">
            <div className="success-check-bubble">
              <CheckCircle2 size={40} />
            </div>
            <h2>Request Submitted Successfully!</h2>
            <p style={{ color: "var(--muted)", fontSize: "14px", margin: "0 0 16px" }}>
              Your Apna Aangan manager for <strong>{managedSuccessData.tier === "premium" ? "Premium Listing (₹999)" : "Standard Listing (₹499)"}</strong> has been assigned to your request.
            </p>
            <span className="managed-txn-id">Transaction Reference: {managedSuccessData.transactionId}</span>

            <div className="managed-next-steps">
              <h4>What happens next?</h4>
              <ol>
                <li>An Apna Aangan manager will call your verified number ({managedForm.ownerContactPhone || user?.phone || "registered phone"}) within 2 business hours.</li>
                <li>They will collect and verify your property specifications, lease terms, and photographs.</li>
                {managedSuccessData.tier === "premium" && (
                  <li>Our team will polish your listing photos and activate your <strong>Priority &ldquo;Recommended&rdquo; Boost</strong>.</li>
                )}
                <li>Once confirmed, your property will be published live on Apna Aangan!</li>
              </ol>
            </div>

            <div style={{ display: "flex", gap: "12px", justifyContent: "center" }}>
              <Link href="/owner" className="btn btn-primary">
                Go to Owner Dashboard <ArrowRight size={16} />
              </Link>
              <button
                type="button"
                className="btn btn-outline"
                onClick={() => {
                  setListingFlowMode("choose_mode");
                  setManagedSuccessData(null);
                }}
              >
                Submit Another Request
              </button>
            </div>
          </div>
        )}

        {/* ─────────────────────────────────────────────────────────────
            STANDARD SELF-LISTING FORM (When Self-Listing selected)
           ───────────────────────────────────────────────────────────── */}
        {listingFlowMode === "self_form" && (
          <>
            <div className="post-heading" style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", flexWrap: "wrap", gap: "16px" }}>
              <div>
                <span className="eyebrow">
                  <span className="eyebrow-line" /> DO IT YOURSELF · SELF-LISTING
                </span>
                <h1>
                  List your space with <em>clarity.</em>
                </h1>
                <p>Provide verified ownership &amp; property details. Our team audits every listing before it goes live.</p>
              </div>
              {!editId && (
                <button
                  type="button"
                  className="btn btn-outline"
                  style={{ fontSize: "11px", fontWeight: 700 }}
                  onClick={() => setListingFlowMode("choose_tier")}
                >
                  <Sparkles size={14} style={{ color: "#7c3aed" }} /> Switch to Hire a Manager
                </button>
              )}
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
                        value={extractIndianPhoneDigits(form.ownerPhone)}
                        maxLength={14}
                        inputMode="numeric"
                        pattern="[6-9][0-9]{9}"
                        onChange={(e) => update({ ownerPhone: extractIndianPhoneDigits(e.target.value) })}
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

                {/* KYC Upload Drop/Retry Alert */}
                {failedSingleUpload && (
                  <div className="form-error" role="alert" style={{ marginTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                    <span>{failedSingleUpload.type === "selfie" ? "Selfie" : "Aadhaar"} upload failed ({failedSingleUpload.file.name}): {failedSingleUpload.reason}</span>
                    <button
                      type="button"
                      className="btn btn-outline"
                      style={{ fontSize: "12px", padding: "5px 10px", height: "auto" }}
                      disabled={uploadingSelfie || uploadingAadhaar}
                      onClick={() => void handleUploadSingle(failedSingleUpload.file, failedSingleUpload.type)}
                    >
                      Retry upload
                    </button>
                  </div>
                )}

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

                <label className="form-label">LISTING TYPE</label>
                <div className="post-category-grid" style={{ gridTemplateColumns: "1fr" }}>
                  <button
                    type="button"
                    className="selected"
                    onClick={() => update({ category: "rent_home" })}
                  >
                    <KeyRound size={23} />
                    <strong>Rent out a home</strong>
                    <small>Residential rental listing (Apartment, independent house, villa, studio or floor)</small>
                    <span className="post-selected-check"><Check size={14} /></span>
                  </button>
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
                      placeholder="e.g. 302020"
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
                {(() => {
                  const liveViolation = findFirstContactViolation(form, ["address", "locality", "landmark"]);
                  return liveViolation ? (
                    <small style={{ display: "block", color: "#b91c1c", fontWeight: 600, marginTop: "6px" }}>
                      {liveViolation.field}: {liveViolation.reason}
                    </small>
                  ) : null;
                })()}

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
                <p>Accurate specifications help the right tenant find your listing quickly.</p>

                <label className="form-label">PROPERTY TYPE <span style={{ color: "#dc2626" }}>*</span></label>
                <div className="choice-pill-row">
                  {(propertyTypesByCategory[form.category] || PROPERTY_TYPES_BY_VERTICAL.rent_home).map((type) => (
                    <button
                      key={type}
                      type="button"
                      className={(form.propertyType || "Apartment") === type ? "selected" : ""}
                      onClick={() => update({ propertyType: type, category: "rent_home" })}
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
                      className={(form.bhkOrRoomType || "2 BHK") === bhk ? "selected" : ""}
                      onClick={() => update({ bhkOrRoomType: bhk, category: "rent_home" })}
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
                      step="1"
                      min={LISTING_LIMITS.rent_home.minAreaSqft}
                      max={LISTING_LIMITS.rent_home.maxAreaSqft}
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

                {/* Rental Financials & Terms */}
                <div className="form-two-cols">
                  <div>
                    <label className="form-label" htmlFor="rent-price">
                      MONTHLY RENT (₹) <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      id="rent-price"
                      className="form-input"
                      type="number"
                      step="1"
                      min={LISTING_LIMITS.rent_home.minPrice}
                      max={LISTING_LIMITS.rent_home.maxPrice}
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
                      step="1"
                      min="0"
                      max={LISTING_LIMITS.rent_home.maxDeposit}
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

                {/* Maintenance Charges */}
                <label className="form-label" style={{ marginTop: "18px" }}>
                  MAINTENANCE CHARGES <span style={{ color: "#dc2626" }}>*</span>
                </label>
                <div className="ownership-pill-row">
                  <button
                    type="button"
                    className={form.maintenanceStatus === "included" ? "selected" : ""}
                    onClick={() => update({ maintenanceStatus: "included" })}
                  >
                    Included in Monthly Rent
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
                      step="1"
                      min="1"
                      max={LISTING_LIMITS.rent_home.maxMaintenance}
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
                  disabled={uploadingPhotos || form.images.length >= MAX_LISTING_IMAGES}
                  onClick={() => photosInputRef.current?.click()}
                >
                  <span><CloudUpload size={29} /></span>
                  <strong>{uploadingPhotos ? "Optimizing & converting photos to WebP..." : "Click or drag to upload property photos"}</strong>
                  <small>JPG, PNG, WebP (max 10 MB each) · EXIF-corrected &amp; WebP-optimized · 5 to {MAX_LISTING_IMAGES} photos</small>
                </button>

                {failedPhotoUploads.length > 0 && (
                  <div className="form-error" role="alert" style={{ marginTop: "12px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                    <span>
                      {failedPhotoUploads.length} photo upload(s) dropped ({failedPhotoUploads.map((f) => f.file.name).join(", ")}).
                    </span>
                    <div style={{ display: "flex", gap: "8px" }}>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ fontSize: "12px", padding: "5px 10px", height: "auto" }}
                        disabled={uploadingPhotos}
                        onClick={() => void retryFailedPhotos()}
                      >
                        {uploadingPhotos ? "Retrying..." : "Retry failed uploads"}
                      </button>
                      <button
                        type="button"
                        className="btn btn-outline"
                        style={{ fontSize: "12px", padding: "5px 10px", height: "auto" }}
                        disabled={uploadingPhotos}
                        onClick={() => setFailedPhotoUploads([])}
                      >
                        Dismiss
                      </button>
                    </div>
                  </div>
                )}

                {form.images.length > 0 && (
                  <div className="uploaded-grid">
                    {form.images.map((image, index) => (
                      <div key={`${image}-${index}`}>
                        <img src={image} alt={`Property photo ${index + 1}`} />
                        {index === 0 && <span>Cover photo</span>}
                        <div style={{ position: "absolute", left: "6px", right: "6px", bottom: "6px", display: "flex", gap: "4px", justifyContent: "space-between", alignItems: "center" }}>
                          <div style={{ display: "flex", gap: "4px" }}>
                            {index > 0 && (
                              <button
                                type="button"
                                style={{ position: "static", width: "26px", height: "26px" }}
                                onClick={() => movePhoto(index, -1)}
                                title="Move left"
                                aria-label={`Move photo ${index + 1} earlier`}
                              >
                                <ChevronLeft size={14} />
                              </button>
                            )}
                            {index < form.images.length - 1 && (
                              <button
                                type="button"
                                style={{ position: "static", width: "26px", height: "26px" }}
                                onClick={() => movePhoto(index, 1)}
                                title="Move right"
                                aria-label={`Move photo ${index + 1} later`}
                              >
                                <ChevronRight size={14} />
                              </button>
                            )}
                            {index > 0 && (
                              <button
                                type="button"
                                style={{ position: "static", width: "26px", height: "26px" }}
                                onClick={() => makeCoverPhoto(index)}
                                title="Make cover photo"
                                aria-label={`Set photo ${index + 1} as cover`}
                              >
                                <Star size={13} />
                              </button>
                            )}
                          </div>
                          <button
                            type="button"
                            style={{ position: "static", width: "26px", height: "26px" }}
                            onClick={() => update({ images: form.images.filter((_, photoIndex) => photoIndex !== index) })}
                            aria-label={`Remove photo ${index + 1}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
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
                    <span>Rental Home · {form.propertyType}</span>
                    <h3>{autoTitlePreview}</h3>
                    <p><MapPin size={15} /> {form.locality}, {form.city} (PIN: {form.pinCode})</p>
                    <strong>
                      ₹{Number(form.price).toLocaleString("en-IN")}/month
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
                    <strong>{form.maintenanceStatus === "included" ? "Included in rent" : `₹${form.maintenanceAmount}/mo separate`}</strong>
                  </div>
                  <div>
                    <span>Deposit &amp; Preference</span>
                    <strong>Deposit ₹{Number(form.deposit).toLocaleString("en-IN")} · {form.tenantPreference}</strong>
                  </div>
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
              <div className="form-error" role="alert" style={{ marginTop: "18px", display: "flex", alignItems: "center", justifyContent: "space-between", gap: "10px", flexWrap: "wrap" }}>
                <span>{error}</span>
                {lastSubmitAction && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ fontSize: "12px", padding: "5px 10px", height: "auto" }}
                    disabled={submitting || savingDraft}
                    onClick={() => (lastSubmitAction === "draft" ? void saveDraft() : void submit())}
                  >
                    {lastSubmitAction === "draft" ? "Retry saving draft" : "Retry submission"}
                  </button>
                )}
              </div>
            )}

            {/* Footer Navigation */}
            <div className="post-form-footer" style={{ flexWrap: "wrap", gap: "10px" }}>
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

              <div style={{ display: "flex", gap: "10px", alignItems: "center", flexWrap: "wrap" }}>
                {(!editId || editingStatus === "draft") && (
                  <button
                    type="button"
                    className="btn btn-outline"
                    disabled={loadingEdit || submitting || savingDraft || uploadingSelfie || uploadingAadhaar || uploadingPhotos}
                    onClick={() => void saveDraft()}
                  >
                    <Save size={16} />
                    {savingDraft ? "Saving draft..." : "Save as draft"}
                  </button>
                )}

                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={loadingEdit || submitting || savingDraft || uploadingSelfie || uploadingAadhaar || uploadingPhotos}
                  onClick={() => (step === steps.length - 1 ? void submit() : nextStep())}
                >
                  {step === steps.length - 1
                    ? submitting
                      ? editId ? "Saving changes..." : "Submitting for verification..."
                      : editId ? "Save & resubmit for review" : "Submit for verification"
                    : "Continue"}
                  {step === steps.length - 1 ? <Check size={17} /> : <ArrowRight size={17} />}
                </button>
              </div>
            </div>
          </div>
        </div>
          </>
        )}
      </div>

      {/* ─────────────────────────────────────────────────────────────
          CHECKOUT & PAYMENT CONFIRMATION MODAL
         ───────────────────────────────────────────────────────────── */}
      {showCheckoutModal && (
        <div className="mgr-modal-backdrop" onClick={() => !submittingManagerRequest && setShowCheckoutModal(false)}>
          <div className="mgr-modal-card" onClick={(e) => e.stopPropagation()}>
            <div className="mgr-modal-header">
              <div>
                <span className="eyebrow">
                  {selectedTier === "premium" ? "⭐ RECOMMENDED TIER" : "STANDARD TIER"}
                </span>
                <h3>Confirm Managed Listing Request</h3>
              </div>
              <button
                type="button"
                className="mgr-modal-close"
                onClick={() => setShowCheckoutModal(false)}
                disabled={submittingManagerRequest}
                aria-label="Close modal"
              >
                <X size={20} />
              </button>
            </div>

            <div className={`mgr-tier-summary-box ${selectedTier === "premium" ? "premium" : ""}`}>
              <div>
                <strong>{selectedTier === "premium" ? "Premium Listing — ₹999" : "Standard Listing — ₹499"}</strong>
                <span>{selectedTier === "premium" ? "Complete verification, photo polish & Recommended boost" : "Direct manager listing & standard placement"}</span>
              </div>
              <div className="mgr-tier-fee-display">
                {selectedTier === "premium" ? "₹999" : "₹499"}
              </div>
            </div>

            <form onSubmit={submitManagerRequest}>
              <div style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
                <div>
                  <label className="form-label" style={{ display: "block", marginBottom: "6px" }}>
                    Property Locality / Area <span style={{ color: "#dc2626" }}>*</span>
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. Vaishali Nagar, Mansarovar, Jagatpura"
                    value={managedForm.locality}
                    onChange={(e) => setManagedForm({ ...managedForm, locality: e.target.value })}
                    required
                  />
                </div>

                <div className="form-two-cols">
                  <div>
                    <label className="form-label" style={{ display: "block", marginBottom: "6px" }}>
                      City
                    </label>
                    <input
                      type="text"
                      className="form-input"
                      placeholder="e.g. Bengaluru"
                      value={managedForm.city}
                      onChange={(e) => setManagedForm({ ...managedForm, city: e.target.value })}
                    />
                  </div>
                  <div>
                    <label className="form-label" style={{ display: "block", marginBottom: "6px" }}>
                      Owner Contact Phone <span style={{ color: "#dc2626" }}>*</span>
                    </label>
                    <input
                      type="tel"
                      className="form-input"
                      placeholder="10-digit mobile"
                      value={managedForm.ownerContactPhone}
                      onChange={(e) => setManagedForm({ ...managedForm, ownerContactPhone: e.target.value.replace(/\D/g, "").slice(0, 10) })}
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="form-label" style={{ display: "block", marginBottom: "6px" }}>
                    Optional Property Title or Landmark
                  </label>
                  <input
                    type="text"
                    className="form-input"
                    placeholder="e.g. 2 BHK Sunlit Flat near Metro Station"
                    value={managedForm.propertyTitle}
                    onChange={(e) => setManagedForm({ ...managedForm, propertyTitle: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ display: "block", marginBottom: "6px" }}>
                    Notes for the Manager (Optional)
                  </label>
                  <textarea
                    className="form-input"
                    rows={2}
                    placeholder="Any specific instructions, preferred call time, or rent expectations..."
                    value={managedForm.notes}
                    onChange={(e) => setManagedForm({ ...managedForm, notes: e.target.value })}
                  />
                </div>

                <div>
                  <label className="form-label" style={{ display: "block", marginBottom: "4px" }}>
                    Select Payment Method
                  </label>
                  <div className="payment-method-selector">
                    <button
                      type="button"
                      className={`pm-option ${managedForm.paymentMethod === "upi" ? "active" : ""}`}
                      onClick={() => setManagedForm({ ...managedForm, paymentMethod: "upi" })}
                    >
                      📱 UPI / GPay
                    </button>
                    <button
                      type="button"
                      className={`pm-option ${managedForm.paymentMethod === "card" ? "active" : ""}`}
                      onClick={() => setManagedForm({ ...managedForm, paymentMethod: "card" })}
                    >
                      💳 Card
                    </button>
                    <button
                      type="button"
                      className={`pm-option ${managedForm.paymentMethod === "netbanking" ? "active" : ""}`}
                      onClick={() => setManagedForm({ ...managedForm, paymentMethod: "netbanking" })}
                    >
                      🏦 NetBanking
                    </button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: "10px", marginTop: "10px" }}>
                  <button
                    type="button"
                    className="btn btn-outline"
                    style={{ flex: 1 }}
                    onClick={() => setShowCheckoutModal(false)}
                    disabled={submittingManagerRequest}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    className="btn btn-primary"
                    style={{ flex: 2, fontWeight: 800 }}
                    disabled={submittingManagerRequest}
                  >
                    {submittingManagerRequest ? "Processing..." : `Pay ₹${selectedTier === "premium" ? "999" : "499"} & Submit Request`}
                  </button>
                </div>
              </div>
            </form>
          </div>
        </div>
      )}
    </main>
  );
}
