export const nearbyPlaceTypes = [
  "pharmacy",
  "craft",
  "bookstore",
  "market",
  "grocery",
  "convenience",
  "clinic",
  "hospital",
  "atm",
  "laundry",
  "beauty",
  "florist",
  "bakery",
  "souvenir",
  "antiques",
  "toilets",
  "fuel",
  "post_office",
  "police",
  "exchange",
  "luggage",
] as const;

export type NearbyPlaceType = (typeof nearbyPlaceTypes)[number];

type NearbyPlaceDefinition = {
  label: string;
  searchTerm: string;
};

export const nearbyPlaceDefinitions: Record<NearbyPlaceType, NearbyPlaceDefinition> = {
  pharmacy: { label: "药店", searchTerm: "pharmacy" },
  craft: { label: "手工艺品店", searchTerm: "handicraft shop" },
  bookstore: { label: "书店", searchTerm: "bookstore" },
  market: { label: "市场", searchTerm: "marketplace" },
  grocery: { label: "超市", searchTerm: "supermarket" },
  convenience: { label: "便利店", searchTerm: "convenience store" },
  clinic: { label: "诊所", searchTerm: "clinic" },
  hospital: { label: "医院", searchTerm: "hospital" },
  atm: { label: "ATM", searchTerm: "ATM" },
  laundry: { label: "洗衣店", searchTerm: "laundry" },
  beauty: { label: "理发美容", searchTerm: "hairdresser" },
  florist: { label: "花店", searchTerm: "florist" },
  bakery: { label: "面包店", searchTerm: "bakery" },
  souvenir: { label: "纪念品店", searchTerm: "souvenir shop" },
  antiques: { label: "古董店", searchTerm: "antiques shop" },
  toilets: { label: "公共厕所", searchTerm: "public toilets" },
  fuel: { label: "加油站", searchTerm: "fuel station" },
  post_office: { label: "邮局", searchTerm: "post office" },
  police: { label: "警察局", searchTerm: "police station" },
  exchange: { label: "货币兑换", searchTerm: "currency exchange" },
  luggage: { label: "行李寄存", searchTerm: "luggage locker" },
};

const nearbyPlaceRules: Array<[NearbyPlaceType, RegExp]> = [
  ["pharmacy", /药店|药房|药局|pharmacy|chemist/i],
  ["craft", /手工艺|工艺品|手作|handicraft|craft shop|artisan shop/i],
  ["bookstore", /书店|书局|bookstore|book shop/i],
  ["market", /市集|集市|菜市场|跳蚤市场|marketplace|street market|flea market/i],
  ["grocery", /超市|生鲜店|杂货店|supermarket|grocery|greengrocer/i],
  ["convenience", /便利店|convenience store/i],
  ["hospital", /医院|急诊|hospital|emergency room/i],
  ["clinic", /诊所|牙医|医生|clinic|doctor|dentist/i],
  ["atm", /取款机|提款机|自动柜员机|\bATM\b/i],
  ["laundry", /洗衣(?:店|服)?|自助洗衣|干洗|laundry|dry clean/i],
  ["beauty", /理发店|美发店|美容店|hairdresser|barber|beauty salon/i],
  ["florist", /花店|鲜花店|florist|flower shop/i],
  ["bakery", /面包店|烘焙店|bakery|boulangerie/i],
  ["souvenir", /纪念品店|伴手礼|礼品店|souvenir|gift shop/i],
  ["antiques", /古董店|古玩店|二手店|antiques|second.hand/i],
  ["toilets", /公共厕所|洗手间|卫生间|public toilet|restroom/i],
  ["fuel", /加油站|充电站|fuel station|gas station/i],
  ["post_office", /邮局|邮政|post office/i],
  ["police", /警察局|派出所|police station/i],
  ["exchange", /换汇|外币兑换|货币兑换|currency exchange|bureau de change/i],
  ["luggage", /行李寄存|存行李|寄存柜|luggage storage|luggage locker/i],
];

export function isNearbyPlaceType(value: unknown): value is NearbyPlaceType {
  return typeof value === "string" && nearbyPlaceTypes.includes(value as NearbyPlaceType);
}

export function detectNearbyPlaceType(text: string): NearbyPlaceType | null {
  return nearbyPlaceRules.find(([, rule]) => rule.test(text))?.[0] ?? null;
}
