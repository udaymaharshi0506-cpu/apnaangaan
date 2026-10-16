"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, BadgeCheck, Building2, Camera, Check, CheckCircle2, ChevronRight, CloudUpload, Home, Image as ImageIcon, KeyRound, LockKeyhole, MapPin, Plus, ShieldCheck, Sparkles, Trash2, UsersRound } from "lucide-react";
import { apiFetch, useApp } from "@/components/providers";

const steps = ["Category", "The basics", "Location", "Details", "Photos", "Pricing", "Review"];
const categories = [
  { value: "buy_home", label: "Sell a home", description: "Apartment, house, villa or plot", icon: Home },
  { value: "rent_home", label: "Rent out a home", description: "Apartment or independent house", icon: KeyRound },
  { value: "rent_pg", label: "List a PG", description: "PG or co-living room", icon: UsersRound },
  { value: "rent_commercial", label: "Rent commercial", description: "Office, shop, showroom or warehouse", icon: Building2 },
];
const types: Record<string, string[]> = { buy_home: ["Apartment", "Independent house", "Villa", "Plot"], rent_home: ["Apartment", "Independent house"], rent_pg: ["PG", "Co-living"], rent_commercial: ["Office", "Shop", "Showroom", "Warehouse"] };
const amenityOptions = ["Covered Parking", "Balcony", "Power Backup", "Security", "Lift", "Wi-Fi", "Modular Kitchen", "Water Supply", "Park Nearby", "Private Garden", "Meals Included", "Housekeeping", "Laundry", "Meeting Room"];
type FormDataState = { category: string; propertyType: string; title: string; description: string; address: string; city: string; locality: string; latitude: string; longitude: string; bhkOrRoomType: string; areaSqft: string; bathrooms: string; furnishingStatus: string; amenities: string[]; images: string[]; price: string; priceType: string; availabilityDate: string; deposit: string; reraNumber: string };
const initial: FormDataState = { category: "", propertyType: "", title: "", description: "", address: "", city: "Bengaluru", locality: "", latitude: "", longitude: "", bhkOrRoomType: "", areaSqft: "", bathrooms: "1", furnishingStatus: "Unfurnished", amenities: [], images: [], price: "", priceType: "fixed", availabilityDate: "", deposit: "", reraNumber: "" };

async function compressImage(file: File): Promise<File> {
  if (file.size < 500000 && ["image/jpeg", "image/png", "image/webp"].includes(file.type)) return file;
  try {
    let img: ImageBitmap | HTMLImageElement;
    let width = 0, height = 0;
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
  const [uploading, setUploading] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [imageUrl, setImageUrl] = useState("");
  const fileInput = useRef<HTMLInputElement>(null);
  useEffect(() => { try { const saved = localStorage.getItem("aangan-property-draft"); if (saved) setForm({ ...initial, ...JSON.parse(saved) }); } catch { /* Ignore incomplete local drafts. */ } }, []);
  useEffect(() => { if (form.category) localStorage.setItem("aangan-property-draft", JSON.stringify(form)); }, [form]);
  function update(changes: Partial<FormDataState>) { setForm((old) => ({ ...old, ...changes })); setError(""); }
  function nextStep() {
    let message = "";
    if (step === 0 && (!form.category || !form.propertyType)) message = "Choose a category and property type to continue.";
    if (step === 1 && (form.title.trim().length < 8 || form.description.trim().length < 25)) message = "Add a title of at least 8 characters and a description of at least 25 characters.";
    if (step === 2 && (form.address.trim().length < 5 || form.city.trim().length < 2 || form.locality.trim().length < 2)) message = "Please add the address, city, and locality.";
    if (step === 3 && (!form.bhkOrRoomType.trim() || !Number(form.areaSqft) || Number(form.areaSqft) < 1)) message = "Add the room type and property area.";
    if (step === 4 && form.images.length === 0) message = "Add at least one photo of your space.";
    if (step === 5 && (!Number(form.price) || Number(form.price) < 1)) message = "Enter a valid asking price.";
    if (message) { setError(message); return; }
    setError(""); setStep((old) => Math.min(old + 1, 6)); window.scrollTo({ top: 0, behavior: "smooth" });
  }
  async function upload(files: FileList | null) {
    if (!files?.length) return;
    setUploading(true);
    setError("");
    const remainingSlots = 12 - form.images.length;
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
      } catch (problem) {
        lastError = problem instanceof Error ? problem.message : "Couldn't upload that photo.";
      }
    }

    if (lastError) {
      setError(lastError);
    }
    setUploading(false);
    if (fileInput.current) fileInput.current.value = "";
  }
  async function submit() {
    setSubmitting(true); setError("");
    try {
      const cleanPrice = Math.round(Number(String(form.price).replace(/,/g, ""))) || 0;
      const cleanArea = Math.round(Number(String(form.areaSqft).replace(/,/g, ""))) || 0;
      const cleanBathrooms = Math.max(1, Math.round(Number(form.bathrooms)) || 1);
      const cleanDeposit = form.deposit ? Math.round(Number(String(form.deposit).replace(/,/g, ""))) : null;
      let cleanDate: string | null = null;
      if (form.availabilityDate && !isNaN(new Date(form.availabilityDate).getTime())) {
        cleanDate = new Date(form.availabilityDate).toISOString();
      }
      const payload = {
        ...form,
        price: cleanPrice,
        areaSqft: cleanArea,
        bathrooms: cleanBathrooms,
        latitude: form.latitude ? Number(form.latitude) : null,
        longitude: form.longitude ? Number(form.longitude) : null,
        deposit: cleanDeposit,
        reraNumber: form.reraNumber || null,
        availabilityDate: cleanDate,
      };
      await apiFetch("/api/properties", { method: "POST", body: JSON.stringify(payload) });
      await refreshUser();
      localStorage.removeItem("aangan-property-draft");
      toast("Your listing is on its way to verification!");
      router.push("/owner"); router.refresh();
    } catch (problem) {
      const msg = problem instanceof Error ? problem.message : "Couldn't submit your listing.";
      setError(msg);
      toast(msg, "error");
    }
    finally { setSubmitting(false); }
  }
  async function upgrade() { try { await apiFetch("/api/profile", { method: "PATCH", body: JSON.stringify({ addOwnerRole: true }) }); await refreshUser(); toast("Owner tools activated"); } catch { toast("Couldn't activate owner tools", "error"); } }
  if (!loading && !user) return <main className="member-page"><div className="container"><div className="account-gate"><span><LockKeyhole size={30}/></span><h2>Let&apos;s get your space listed.</h2><p>Sign in first to share your property securely with the Aangan community.</p><Link href="/login?next=/post-property" className="btn btn-primary">Log in to continue <ArrowRight size={17}/></Link></div></div></main>;
  if (!loading && user && !user.roles.includes("owner") && !user.roles.includes("admin")) return <main className="member-page"><div className="container"><div className="account-gate"><span><KeyRound size={30}/></span><h2>Become an Aangan owner.</h2><p>Activate your owner space to post a property and receive private, anonymous interest updates.</p><button onClick={() => void upgrade()} className="btn btn-primary">Activate owner tools <ArrowRight size={17}/></button></div></div></main>;
  const currentCategory = categories.find((item) => item.value === form.category);
  const lat = Number(form.latitude) || 12.9352, lon = Number(form.longitude) || 77.6245;
  const mapUrl = `https://www.openstreetmap.org/export/embed.html?bbox=${lon - .02}%2C${lat - .014}%2C${lon + .02}%2C${lat + .014}&layer=mapnik&marker=${lat}%2C${lon}`;
  return <main className="post-page"><div className="container"><div className="post-top"><Link href="/owner"><ArrowLeft size={17}/> Back to dashboard</Link><span><ShieldCheck size={16}/> Verified before going live</span></div><div className="post-heading"><span className="eyebrow"><span className="eyebrow-line"/> SHARE YOUR SPACE</span><h1>Let’s make your place <em>shine.</em></h1><p>Tell us a little about it. We’ll take care of the rest.</p></div><div className="post-layout"><aside className="post-stepper"><strong>YOUR LISTING</strong>{steps.map((label, index) => <button key={label} className={`${index === step ? "active" : ""} ${index < step ? "complete" : ""}`} onClick={() => index < step && setStep(index)}><span>{index < step ? <Check size={15}/> : String(index + 1).padStart(2, "0")}</span>{label}</button>)}<div className="post-help"><Sparkles size={19}/><strong>A little help, always.</strong><p>Our team reviews every listing for accuracy before it goes live.</p></div></aside><div className="post-form-card"><div className="post-form-top"><span>STEP {String(step + 1).padStart(2, "0")} OF 07</span><span>{Math.round(((step + 1) / steps.length) * 100)}% COMPLETE</span></div><div className="post-progress"><span style={{ width: `${((step + 1) / steps.length) * 100}%` }}/></div>
  {step === 0 && <div className="post-step-content"><h2>What kind of space?</h2><p>Choose the category that fits your property best.</p><div className="post-category-grid">{categories.map(({ value, label, description, icon: Icon }) => <button key={value} className={form.category === value ? "selected" : ""} onClick={() => update({ category: value, propertyType: "" })}><Icon size={23}/><strong>{label}</strong><small>{description}</small><span className="post-selected-check"><Check size={14}/></span></button>)}</div>{form.category && <><label className="form-label">PROPERTY TYPE</label><div className="post-choice-row">{types[form.category].map((item) => <button key={item} className={form.propertyType === item ? "selected" : ""} onClick={() => update({ propertyType: item })}>{item}</button>)}</div></>}</div>}
  {step === 1 && <div className="post-step-content"><h2>Tell your story.</h2><p>The little details help someone picture life in your space.</p><label className="form-label" htmlFor="post-title">LISTING TITLE</label><input id="post-title" className="form-input" value={form.title} onChange={(e) => update({ title: e.target.value })} placeholder="e.g. A light-filled 2 BHK in Indiranagar" maxLength={180}/><span className="field-tip">Keep it clear, warm and specific. At least 8 characters.</span><label className="form-label" htmlFor="post-description">DESCRIPTION</label><textarea id="post-description" className="form-input" rows={7} value={form.description} onChange={(e) => update({ description: e.target.value })} placeholder="What makes this place special? Tell us about the light, the neighbourhood, or your favourite little corner..." maxLength={5000}/><span className="field-tip">At least 25 characters. Contact details are not allowed in descriptions.</span></div>}
  {step === 2 && <div className="post-step-content"><h2>Where is it?</h2><p>Help seekers get a feel for the neighbourhood.</p><div className="form-two-cols"><div><label className="form-label">CITY</label><input className="form-input" value={form.city} onChange={(e) => update({ city: e.target.value })} placeholder="Bengaluru"/></div><div><label className="form-label">LOCALITY</label><input className="form-input" value={form.locality} onChange={(e) => update({ locality: e.target.value })} placeholder="e.g. Koramangala"/></div></div><label className="form-label">STREET ADDRESS</label><input className="form-input" value={form.address} onChange={(e) => update({ address: e.target.value })} placeholder="Building name, street, area"/><div className="form-two-cols"><div><label className="form-label">LATITUDE <small>(OPTIONAL)</small></label><input className="form-input" type="number" step="any" value={form.latitude} onChange={(e) => update({ latitude: e.target.value })} placeholder="12.9352"/></div><div><label className="form-label">LONGITUDE <small>(OPTIONAL)</small></label><input className="form-input" type="number" step="any" value={form.longitude} onChange={(e) => update({ longitude: e.target.value })} placeholder="77.6245"/></div></div><div className="post-map-preview"><iframe title="Location preview" src={mapUrl} loading="lazy"/><span><MapPin size={15}/> Approximate map preview</span></div><p className="field-tip"><LockKeyhole size={14}/> We only use the location to show the property on a map. No owner details are shared.</p></div>}
  {step === 3 && <div className="post-step-content"><h2>The thoughtful details.</h2><p>Help the right person see why this place feels right.</p><div className="form-two-cols"><div><label className="form-label">{form.category === "rent_pg" ? "ROOM TYPE" : form.category === "rent_commercial" ? "SPACE TYPE" : "BEDROOMS"}</label><input className="form-input" value={form.bhkOrRoomType} onChange={(e) => update({ bhkOrRoomType: e.target.value })} placeholder={form.category === "rent_pg" ? "Private room" : form.category === "rent_commercial" ? "Office space" : "e.g. 2 BHK"}/></div><div><label className="form-label">AREA IN SQFT</label><input className="form-input" type="number" min="1" value={form.areaSqft} onChange={(e) => update({ areaSqft: e.target.value })} placeholder="e.g. 1200"/></div></div><div className="form-two-cols"><div><label className="form-label">BATHROOMS</label><input className="form-input" type="number" min="0" value={form.bathrooms} onChange={(e) => update({ bathrooms: e.target.value })}/></div><div><label className="form-label">FURNISHING</label><select className="form-input" value={form.furnishingStatus} onChange={(e) => update({ furnishingStatus: e.target.value })}><option>Unfurnished</option><option>Semi-furnished</option><option>Fully furnished</option></select></div></div><label className="form-label">AMENITIES <small>(SELECT ALL THAT APPLY)</small></label><div className="amenity-choices">{amenityOptions.map((item) => <button key={item} className={form.amenities.includes(item) ? "selected" : ""} onClick={() => update({ amenities: form.amenities.includes(item) ? form.amenities.filter((a) => a !== item) : [...form.amenities, item] })}>{form.amenities.includes(item) ? <Check size={14}/> : <Plus size={14}/>} {item}</button>)}</div></div>}
  {step === 4 && <div className="post-step-content"><h2>Show it off.</h2><p>Good photos let people imagine their own story here. Add up to 12.</p><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp,image/heic,image/heif,.jpg,.jpeg,.png,.webp,.heic" multiple hidden onChange={(e) => void upload(e.target.files)}/><button className="upload-zone" disabled={uploading || form.images.length >= 12} onClick={() => fileInput.current?.click()}><span><CloudUpload size={29}/></span><strong>{uploading ? "Uploading your photos..." : "Click to upload photos"}</strong><small>JPG, PNG or WebP · up to 10 MB each</small></button>{form.images.length > 0 && <div className="uploaded-grid">{form.images.map((image, index) => <div key={`${image}-${index}`}><img src={image} alt={`Property photo ${index + 1}`}/>{index === 0 && <span>Cover photo</span>}<button onClick={() => update({ images: form.images.filter((_, photoIndex) => photoIndex !== index) })} aria-label={`Remove photo ${index + 1}`}><Trash2 size={15}/></button></div>)}</div>}<div className="image-url-field"><input className="form-input" value={imageUrl} onChange={(e) => setImageUrl(e.target.value)} placeholder="Or paste an https:// image URL"/><button onClick={() => { if (imageUrl.startsWith("https://")) { update({ images: [...form.images, imageUrl] }); setImageUrl(""); } else setError("Please enter a secure https:// image URL."); }}><Plus size={16}/> Add</button></div></div>}
  {step === 5 && <div className="post-step-content"><h2>Set your terms.</h2><p>Be clear about pricing so the right people can find you.</p><div className="form-two-cols"><div><label className="form-label">{form.category === "buy_home" ? "ASKING PRICE (₹)" : "MONTHLY RENT (₹)"}</label><input className="form-input" type="number" min="1" value={form.price} onChange={(e) => update({ price: e.target.value })} placeholder="e.g. 45000"/></div><div><label className="form-label">PRICE TYPE</label><select className="form-input" value={form.priceType} onChange={(e) => update({ priceType: e.target.value })}><option value="fixed">Fixed</option><option value="negotiable">Negotiable</option></select></div></div><div className="form-two-cols"><div><label className="form-label">AVAILABLE FROM <small>(OPTIONAL)</small></label><input className="form-input" type="date" value={form.availabilityDate} onChange={(e) => update({ availabilityDate: e.target.value })}/></div>{form.category !== "buy_home" && <div><label className="form-label">SECURITY DEPOSIT (₹) <small>(OPTIONAL)</small></label><input className="form-input" type="number" min="0" value={form.deposit} onChange={(e) => update({ deposit: e.target.value })} placeholder="e.g. 90000"/></div>}</div>{form.category === "buy_home" && <><label className="form-label">RERA REGISTRATION NUMBER <small>(IF APPLICABLE)</small></label><input className="form-input" value={form.reraNumber} onChange={(e) => update({ reraNumber: e.target.value })} placeholder="Project RERA registration number"/><p className="field-tip">Include this for projects where RERA registration is required.</p></>}</div>}
  {step === 6 && <div className="post-step-content"><h2>One last look.</h2><p>Make sure everything feels right before you send it to our team.</p><div className="post-review-card">{form.images[0] && <img src={form.images[0]} alt="Listing cover"/>}<div><span>{currentCategory?.label} · {form.propertyType}</span><h3>{form.title}</h3><p><MapPin size={15}/> {form.locality}, {form.city}</p><strong>₹{Number(form.price).toLocaleString("en-IN")}{form.category !== "buy_home" ? "/mo" : ""}</strong></div></div><div className="review-list"><div><span>Property type</span><strong>{form.propertyType}</strong></div><div><span>Area</span><strong>{form.areaSqft} sqft</strong></div><div><span>Furnishing</span><strong>{form.furnishingStatus}</strong></div><div><span>Amenities</span><strong>{form.amenities.length} selected</strong></div><div><span>Photos</span><strong>{form.images.length} added</strong></div></div><div className="review-assurance"><BadgeCheck size={23}/><div><strong>Verified first. Live second.</strong><p>Our team will review your listing before it appears in search. You’ll be notified when it’s approved.</p></div></div></div>}
  {error && <div className="form-error" role="alert">{error}</div>}<div className="post-form-footer">{step > 0 ? <button className="post-back" onClick={() => { setStep(step - 1); setError(""); }}><ArrowLeft size={17}/> Previous</button> : <span/>}<button className="btn btn-primary" disabled={submitting || uploading} onClick={() => step === 6 ? void submit() : nextStep()}>{step === 6 ? submitting ? "Submitting..." : "Submit for verification" : "Continue"} {step === 6 ? <Check size={17}/> : <ArrowRight size={17}/>}</button></div></div></div></div></main>;
}
