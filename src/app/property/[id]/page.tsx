import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { PropertyDetail } from "@/components/property-detail";
import { getProperty, getSimilarProperties } from "@/lib/queries";
import { serializePublicProperty } from "@/lib/serializers";

import { getServerUser } from "@/lib/auth";

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const dynamic = "force-dynamic";
export async function generateMetadata({ params }: { params: Promise<{ id: string }> }): Promise<Metadata> {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) return { title: "Property not found" };
  const property = await getProperty(id);
  return property ? { title: property.title, description: `${property.bhkOrRoomType} ${property.propertyType} in ${property.locality}, ${property.city}. Explore this verified space on Aangan.`, openGraph: { images: property.images[0] ? [property.images[0]] : [] } } : { title: "Property not found" };
}
export default async function PropertyPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  if (!UUID_REGEX.test(id)) notFound();
  const property = await getProperty(id);
  if (!property) notFound();
  const user = await getServerUser();
  const isOwner = !!user && property.ownerId === user.id;
  const isAdmin = !!user && user.roles.includes("admin");
  const similar = await getSimilarProperties(property);
  return <PropertyDetail property={serializePublicProperty(property)} similar={similar} isOwner={isOwner} isAdmin={isAdmin}/>;
}
