/**
 * Google Maps & Places API Helper for Apnaangaan
 * Supports client-side Google Places Autocomplete, Geocoding, and resilient fallbacks.
 */

let googleMapsLoadingPromise: Promise<boolean> | null = null;

export function getGoogleMapsApiKey(): string {
  return (
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    (typeof window !== "undefined" && (window as any).__GOOGLE_MAPS_API_KEY) ||
    ""
  );
}

/**
 * Loads the Google Maps JavaScript API script with Places library
 */
export function loadGoogleMapsScript(apiKey?: string): Promise<boolean> {
  if (typeof window === "undefined") return Promise.resolve(false);

  // Already loaded
  if ((window as any).google?.maps?.places) {
    return Promise.resolve(true);
  }

  if (googleMapsLoadingPromise) return googleMapsLoadingPromise;

  const key = apiKey || getGoogleMapsApiKey();
  if (!key) {
    return Promise.resolve(false);
  }

  googleMapsLoadingPromise = new Promise((resolve) => {
    // Check if script element already exists
    const existing = document.querySelector('script[src*="maps.googleapis.com/maps/api/js"]');
    if (existing) {
      existing.addEventListener("load", () => resolve(Boolean((window as any).google?.maps?.places)));
      existing.addEventListener("error", () => resolve(false));
      return;
    }

    const script = document.createElement("script");
    script.src = `https://maps.googleapis.com/maps/api/js?key=${encodeURIComponent(key)}&libraries=places&language=en&region=IN`;
    script.async = true;
    script.defer = true;
    script.onload = () => {
      resolve(Boolean((window as any).google?.maps?.places));
    };
    script.onerror = (err) => {
      console.warn("Failed to load Google Maps script:", err);
      resolve(false);
    };
    document.head.appendChild(script);
  });

  return googleMapsLoadingPromise;
}

/**
 * Fetch place predictions using Google Places AutocompleteService with fallback to /api/locations
 */
export async function getPlaceSuggestions(term: string): Promise<{ suggestions: string[]; isGoogle: boolean }> {
  const cleanTerm = term.trim();
  if (!cleanTerm) return { suggestions: [], isGoogle: false };

  // Try Google Maps client-side AutocompleteService if available
  if (typeof window !== "undefined" && (window as any).google?.maps?.places?.AutocompleteService) {
    try {
      const service = new (window as any).google.maps.places.AutocompleteService();
      const predictions = await new Promise<any[]>((resolve) => {
        service.getPlacePredictions(
          {
            input: cleanTerm,
            componentRestrictions: { country: "in" },
            types: ["(regions)"],
          },
          (results: any[], status: any) => {
            if (status === "OK" && Array.isArray(results)) {
              resolve(results);
            } else {
              // Try broader search without types restriction if regions returned empty
              service.getPlacePredictions(
                {
                  input: cleanTerm,
                  componentRestrictions: { country: "in" },
                },
                (broaderResults: any[], broaderStatus: any) => {
                  resolve(broaderStatus === "OK" && Array.isArray(broaderResults) ? broaderResults : []);
                }
              );
            }
          }
        );
      });

      if (predictions.length > 0) {
        const cleaned = predictions.map((p) => {
          return p.description.replace(/, India$/, "");
        });
        return { suggestions: cleaned.slice(0, 8), isGoogle: true };
      }
    } catch (err) {
      console.warn("Google AutocompleteService error, using fallback:", err);
    }
  }

  // Fallback to server endpoint
  try {
    const res = await fetch(`/api/locations?q=${encodeURIComponent(cleanTerm)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data.suggestions) && data.suggestions.length > 0) {
        return { suggestions: data.suggestions, isGoogle: Boolean(data.source === "google") };
      }
    }
  } catch (err) {
    console.warn("Fallback /api/locations error:", err);
  }

  return { suggestions: [], isGoogle: false };
}

/**
 * Reverse geocode coordinates using Google Geocoder with fallback to /api/locations/reverse
 */
export async function reverseGeocode(
  lat: number,
  lon: number
): Promise<{ location: string; city: string; isGoogle: boolean } | null> {
  // Try Google Geocoder if available
  if (typeof window !== "undefined" && (window as any).google?.maps?.Geocoder) {
    try {
      const geocoder = new (window as any).google.maps.Geocoder();
      const result = await new Promise<any>((resolve) => {
        geocoder.geocode({ location: { lat, lng: lon } }, (results: any[], status: string) => {
          if (status === "OK" && results && results.length > 0) {
            resolve(results[0]);
          } else {
            resolve(null);
          }
        });
      });

      if (result) {
        let locality = "";
        let sublocality = "";
        let city = "";
        let state = "";

        for (const component of result.address_components || []) {
          const types: string[] = component.types || [];
          if (types.includes("sublocality") || types.includes("neighborhood")) sublocality = component.long_name;
          if (types.includes("locality")) locality = component.long_name;
          if (!city && types.includes("administrative_area_level_2")) city = component.long_name;
          if (!state && types.includes("administrative_area_level_1")) state = component.long_name;
        }

        const area = sublocality || locality;
        const mainCity = locality || city || state;
        const label = [area, mainCity].filter(Boolean).filter((v, i, a) => a.indexOf(v) === i).join(", ") ||
          result.formatted_address?.split(",").slice(0, 2).join(", ").trim();

        if (label) {
          return { location: label, city: mainCity || label, isGoogle: true };
        }
      }
    } catch (err) {
      console.warn("Google Geocoder client lookup failed:", err);
    }
  }

  // Fallback to server reverse endpoint
  try {
    const res = await fetch(`/api/locations/reverse?lat=${lat}&lon=${lon}`);
    if (res.ok) {
      const data = await res.json();
      if (data.location) {
        return { location: data.location, city: data.city || data.location, isGoogle: Boolean(data.source === "google") };
      }
    }
  } catch (err) {
    console.warn("Server reverse geocode failed:", err);
  }

  return null;
}
