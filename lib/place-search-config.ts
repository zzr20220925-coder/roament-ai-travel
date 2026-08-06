import type { NearbyPlaceType } from "@/lib/place-intent";

type NearbyPlaceSearchConfig = {
  icon: string;
  radiusMeters: number;
  selectors: string[];
};

export const nearbyPlaceSearchConfig: Record<NearbyPlaceType, NearbyPlaceSearchConfig> = {
  pharmacy: { icon: "药", radiusMeters: 5_000, selectors: ['["amenity"="pharmacy"]'] },
  craft: { icon: "艺", radiusMeters: 12_000, selectors: ['["shop"~"^(craft|handicraft|art|gift)$"]'] },
  bookstore: { icon: "书", radiusMeters: 10_000, selectors: ['["shop"="books"]'] },
  market: { icon: "市", radiusMeters: 12_000, selectors: ['["amenity"="marketplace"]'] },
  grocery: { icon: "超", radiusMeters: 6_000, selectors: ['["shop"~"^(supermarket|greengrocer|deli)$"]'] },
  convenience: { icon: "便", radiusMeters: 4_000, selectors: ['["shop"="convenience"]'] },
  clinic: { icon: "医", radiusMeters: 8_000, selectors: ['["amenity"~"^(clinic|doctors|dentist)$"]'] },
  hospital: { icon: "医", radiusMeters: 15_000, selectors: ['["amenity"="hospital"]'] },
  atm: { icon: "取", radiusMeters: 4_000, selectors: ['["amenity"="atm"]'] },
  laundry: { icon: "洗", radiusMeters: 5_000, selectors: ['["shop"="laundry"]'] },
  beauty: { icon: "美", radiusMeters: 5_000, selectors: ['["shop"~"^(hairdresser|beauty)$"]'] },
  florist: { icon: "花", radiusMeters: 6_000, selectors: ['["shop"="florist"]'] },
  bakery: { icon: "包", radiusMeters: 5_000, selectors: ['["shop"="bakery"]'] },
  souvenir: { icon: "礼", radiusMeters: 12_000, selectors: ['["shop"~"^(souvenir|gift)$"]'] },
  antiques: { icon: "古", radiusMeters: 12_000, selectors: ['["shop"~"^(antiques|second_hand)$"]'] },
  toilets: { icon: "卫", radiusMeters: 3_000, selectors: ['["amenity"="toilets"]'] },
  fuel: { icon: "油", radiusMeters: 8_000, selectors: ['["amenity"="fuel"]'] },
  post_office: { icon: "邮", radiusMeters: 8_000, selectors: ['["amenity"="post_office"]'] },
  police: { icon: "警", radiusMeters: 12_000, selectors: ['["amenity"="police"]'] },
  exchange: { icon: "换", radiusMeters: 8_000, selectors: ['["amenity"="bureau_de_change"]'] },
  luggage: { icon: "存", radiusMeters: 6_000, selectors: ['["amenity"="luggage_locker"]', '["locker"="luggage"]'] },
};
