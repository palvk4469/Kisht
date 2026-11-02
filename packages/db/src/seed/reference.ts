// Reference data for the demo: branches, staff and territories (A11).
// All names and numbers are placeholders; no real personal data (A14).

export type BranchRef = { code: string; name: string; city: string };

export type StaffRef = {
  key: string;
  name: string;
  email: string;
  role: "OFFICER" | "BRANCH_MANAGER" | "HEAD";
  branch: string | null;
  locale: "hi" | "en";
  pincodes?: string[];
};

export type PincodeRef = {
  pincode: string;
  branch: string;
  area: string;
  lat: number;
  lng: number;
};

export const BRANCHES: BranchRef[] = [
  { code: "IND", name: "Indore Central", city: "Indore" },
  { code: "PTH", name: "Pithampur", city: "Pithampur" },
];

export const PINCODES: PincodeRef[] = [
  { pincode: "452001", branch: "IND", area: "Siyaganj", lat: 22.7196, lng: 75.8577 },
  { pincode: "452002", branch: "IND", area: "Rajwada", lat: 22.7186, lng: 75.8553 },
  { pincode: "452003", branch: "IND", area: "Sanwer Road", lat: 22.7566, lng: 75.8572 },
  { pincode: "452005", branch: "IND", area: "Palasia", lat: 22.7244, lng: 75.8839 },
  { pincode: "452006", branch: "IND", area: "Polo Ground", lat: 22.7353, lng: 75.8486 },
  { pincode: "452007", branch: "IND", area: "Bhawarkua", lat: 22.6936, lng: 75.8681 },
  { pincode: "452010", branch: "IND", area: "Vijay Nagar", lat: 22.7533, lng: 75.8937 },
  { pincode: "452015", branch: "IND", area: "Palda", lat: 22.68, lng: 75.8951 },
  // Deliberately not in any officer's territory: shows the manager's queue.
  { pincode: "452020", branch: "IND", area: "Super Corridor", lat: 22.7859, lng: 75.8314 },
  { pincode: "454775", branch: "PTH", area: "Sector 1", lat: 22.6127, lng: 75.6821 },
  { pincode: "454774", branch: "PTH", area: "Sector 3", lat: 22.6043, lng: 75.6542 },
  { pincode: "454660", branch: "PTH", area: "Sagore", lat: 22.637, lng: 75.62 },
  { pincode: "453001", branch: "PTH", area: "Betma", lat: 22.6862, lng: 75.6177 },
];

const mail = (key: string) => `${key}@kisht.example`;

export const STAFF: StaffRef[] = [
  {
    key: "anil.mehta",
    name: "Anil Mehta",
    email: mail("anil.mehta"),
    role: "HEAD",
    branch: null,
    locale: "en",
  },
  {
    key: "sanjay.joshi",
    name: "Sanjay Joshi",
    email: mail("sanjay.joshi"),
    role: "BRANCH_MANAGER",
    branch: "IND",
    locale: "en",
  },
  {
    key: "kavita.sharma",
    name: "Kavita Sharma",
    email: mail("kavita.sharma"),
    role: "BRANCH_MANAGER",
    branch: "PTH",
    locale: "en",
  },
  // Indore Central officers; the first three names come from the brief's sample data.
  {
    key: "rahul.chouhan",
    name: "Rahul Chouhan",
    email: mail("rahul.chouhan"),
    role: "OFFICER",
    branch: "IND",
    locale: "hi",
    pincodes: ["452001", "452002", "452003"],
  },
  {
    key: "neha.solanki",
    name: "Neha Solanki",
    email: mail("neha.solanki"),
    role: "OFFICER",
    branch: "IND",
    locale: "hi",
    pincodes: ["452005", "452006", "452002"],
  },
  {
    key: "priya.malviya",
    name: "Priya Malviya",
    email: mail("priya.malviya"),
    role: "OFFICER",
    branch: "IND",
    locale: "hi",
    pincodes: ["452007", "452015"],
  },
  {
    key: "arjun.patidar",
    name: "Arjun Patidar",
    email: mail("arjun.patidar"),
    role: "OFFICER",
    branch: "IND",
    locale: "hi",
    pincodes: ["452010", "452006"],
  },
  // Pithampur officers.
  {
    key: "imran.qureshi",
    name: "Imran Qureshi",
    email: mail("imran.qureshi"),
    role: "OFFICER",
    branch: "PTH",
    locale: "hi",
    pincodes: ["454775", "454774"],
  },
  {
    key: "sunita.yadav",
    name: "Sunita Yadav",
    email: mail("sunita.yadav"),
    role: "OFFICER",
    branch: "PTH",
    locale: "hi",
    pincodes: ["454660", "453001"],
  },
  {
    key: "vikas.rathore",
    name: "Vikas Rathore",
    email: mail("vikas.rathore"),
    role: "OFFICER",
    branch: "PTH",
    locale: "hi",
    pincodes: ["454774", "453001"],
  },
];

export const BUSINESS_TYPES = [
  "packaging unit",
  "fertiliser shop",
  "printing press",
  "kirana wholesaler",
  "auto parts dealer",
  "textile trader",
  "namkeen manufacturer",
  "steel fabrication",
  "hardware store",
  "pharma distributor",
  "furniture workshop",
  "electrical goods trader",
  "dairy",
  "plastic moulding unit",
  "garment unit",
] as const;

// The brief's sample rows, reproduced exactly (relative dates per A15).
export type SampleLoan = {
  loanNo: string;
  company: string;
  businessType: string;
  outstanding: number;
  dpd: number;
  officer: string;
  pincode: string;
  promise: { daysFromToday: number; madeDaysAgo: number } | null;
};

export const SAMPLE_LOANS: SampleLoan[] = [
  {
    loanNo: "LN-10293",
    company: "Company B",
    businessType: "packaging unit",
    outstanding: 640000,
    dpd: 12,
    officer: "rahul.chouhan",
    pincode: "452001",
    promise: { daysFromToday: 3, madeDaysAgo: 1 },
  },
  {
    loanNo: "LN-10871",
    company: "Company C",
    businessType: "fertiliser shop",
    outstanding: 310000,
    dpd: 27,
    officer: "neha.solanki",
    pincode: "452005",
    promise: null,
  },
  {
    loanNo: "LN-11930",
    company: "Company D",
    businessType: "printing press",
    outstanding: 220000,
    dpd: 19,
    officer: "imran.qureshi",
    pincode: "454775",
    // Due 2 days ago; with the one-day grace (A7) it is broken as of today.
    promise: { daysFromToday: -2, madeDaysAgo: 6 },
  },
];
