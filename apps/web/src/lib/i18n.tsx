"use client";

import {
  createContext,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";

// A small typed dictionary instead of an i18n library: two languages, a few
// hundred strings, and TypeScript checks that every key exists in both.
// Officers default to Hindi, managers to English (A16); anyone can switch.

const en = {
  "app.name": "Kisht Collections",
  "lang.toggle": "हिंदी",
  "theme.label": "Theme",
  "theme.light": "Light",
  "theme.dark": "Dark",
  "theme.system": "Same as device",
  "common.loading": "Loading…",
  "common.retry": "Try again",
  "common.cancel": "Cancel",
  "common.signOut": "Sign out",
  "common.offline": "You're offline. Check your connection and try again.",
  "common.error": "Something went wrong.",

  "login.title": "Sign in",
  "login.subtitle": "Field collections for Indore and Pithampur branches",
  "login.email": "Email",
  "login.password": "Password",
  "login.submit": "Sign in",
  "login.submitting": "Signing in…",
  "login.invalid": "That email and password don't match.",
  "login.demo": "Demo accounts",
  "login.demoHint": "One tap signs in with sample data.",
  "login.demo.officer": "Field officer",
  "login.demo.manager": "Branch manager",
  "login.demo.head": "Head of collections",

  "nav.import": "Daily import",
  "role.OFFICER": "Field officer",
  "role.BRANCH_MANAGER": "Branch manager",
  "role.HEAD": "Head of collections",

  "officer.comingSoon": "Your list for today",
  "officer.comingSoonBody": "The prioritised list arrives with the next update.",

  "import.title": "Daily import",
  "import.subtitle":
    "Upload this morning's overdue export from the loan system. Nothing changes until you commit.",
  "import.asOf": "As of",
  "import.file": "Overdue export (CSV)",
  "import.drop": "Choose a CSV file or drop it here",
  "import.dropActive": "Drop the file to use it",
  "import.chosen": "{name} · {size}",
  "import.template": "Download a template",
  "import.sample": "Download today's sample export",
  "import.preview": "Check file",
  "import.previewing": "Checking…",
  "import.ready": "Ready to commit",
  "import.readyBody": "Review what this file will change, then commit.",
  "import.replaces": "This replaces the upload already committed for {date}.",
  "import.rows": "Loans on the list",
  "import.errors": "Rows with errors",
  "import.newLoans": "New loans",
  "import.cured": "Cured since last import",
  "import.payments": "Payments found",
  "import.skipped": "{n} rows for other branches were skipped.",
  "import.assignment": "Assignment",
  "import.kept": "Stay with their officer",
  "import.newAssigned": "Newly assigned",
  "import.moved": "Moved to another officer",
  "import.unassigned": "No officer covers the pincode",
  "import.unassignedHint": "These wait in your queue for a manual assignment.",
  "import.byOfficer": "Loans per officer",
  "import.errorTable": "Rows that will be skipped",
  "import.errorRow": "Row",
  "import.errorField": "Column",
  "import.errorMessage": "Problem",
  "import.commit": "Commit import",
  "import.committing": "Committing…",
  "import.done": "Import committed",
  "import.doneBody": "{rows} loans are on today's lists.",
  "import.promises": "Promises resolved: {kept} kept, {partial} partial, {broken} broken.",
  "import.another": "Upload another file",
  "import.history": "Recent imports",
  "import.historyEmpty": "No imports yet. The first upload starts the history.",
  "import.showAll": "Show all {n}",
  "import.showLess": "Show fewer",
  "import.col.date": "Day",
  "import.col.file": "File",
  "import.col.status": "Status",
  "import.col.rows": "Rows",
  "import.col.by": "Uploaded by",
  "import.status.PREVIEW": "Not committed",
  "import.status.COMMITTED": "Committed",
  "import.status.SUPERSEDED": "Replaced",
  "import.status.FAILED": "Failed",
  "import.noFile": "Choose a CSV file first.",
  "import.notCsv": "That isn't a CSV file. Export the overdue list as CSV and try again.",
  "import.tooBig": "The file is larger than 8 MB.",
} as const;

export type MessageKey = keyof typeof en;
type Dictionary = Record<MessageKey, string>;

const hi: Dictionary = {
  "app.name": "किश्त कलेक्शन",
  "lang.toggle": "English",
  "theme.label": "थीम",
  "theme.light": "लाइट",
  "theme.dark": "डार्क",
  "theme.system": "डिवाइस जैसा",
  "common.loading": "लोड हो रहा है…",
  "common.retry": "फिर से कोशिश करें",
  "common.cancel": "रद्द करें",
  "common.signOut": "लॉग आउट",
  "common.offline": "इंटरनेट नहीं है। कनेक्शन देखकर फिर कोशिश करें।",
  "common.error": "कुछ गड़बड़ हो गई।",

  "login.title": "लॉग इन करें",
  "login.subtitle": "इंदौर और पीथमपुर शाखाओं के लिए फ़ील्ड कलेक्शन",
  "login.email": "ईमेल",
  "login.password": "पासवर्ड",
  "login.submit": "लॉग इन करें",
  "login.submitting": "लॉग इन हो रहा है…",
  "login.invalid": "ईमेल और पासवर्ड मेल नहीं खाते।",
  "login.demo": "डेमो खाते",
  "login.demoHint": "एक टैप में सैंपल डेटा के साथ लॉग इन।",
  "login.demo.officer": "फ़ील्ड ऑफ़िसर",
  "login.demo.manager": "ब्रांच मैनेजर",
  "login.demo.head": "कलेक्शन प्रमुख",

  "nav.import": "रोज़ का इम्पोर्ट",
  "role.OFFICER": "फ़ील्ड ऑफ़िसर",
  "role.BRANCH_MANAGER": "ब्रांच मैनेजर",
  "role.HEAD": "कलेक्शन प्रमुख",

  "officer.comingSoon": "आज की आपकी सूची",
  "officer.comingSoonBody": "प्राथमिकता वाली सूची अगले अपडेट में आएगी।",

  "import.title": "रोज़ का इम्पोर्ट",
  "import.subtitle": "लोन सिस्टम से आज सुबह की ओवरड्यू सूची अपलोड करें। कमिट करने तक कुछ नहीं बदलेगा।",
  "import.asOf": "तारीख",
  "import.file": "ओवरड्यू सूची (CSV)",
  "import.drop": "CSV फ़ाइल चुनें या यहाँ छोड़ें",
  "import.dropActive": "फ़ाइल यहाँ छोड़ें",
  "import.chosen": "{name} · {size}",
  "import.template": "टेम्पलेट डाउनलोड करें",
  "import.sample": "आज की सैंपल सूची डाउनलोड करें",
  "import.preview": "फ़ाइल जाँचें",
  "import.previewing": "जाँच हो रही है…",
  "import.ready": "कमिट के लिए तैयार",
  "import.readyBody": "देखें कि यह फ़ाइल क्या बदलेगी, फिर कमिट करें।",
  "import.replaces": "यह {date} के लिए पहले से कमिट हुए अपलोड की जगह लेगा।",
  "import.rows": "सूची में लोन",
  "import.errors": "गलती वाली पंक्तियाँ",
  "import.newLoans": "नए लोन",
  "import.cured": "पिछले इम्पोर्ट के बाद चुकता",
  "import.payments": "मिले भुगतान",
  "import.skipped": "दूसरी शाखाओं की {n} पंक्तियाँ छोड़ दी गईं।",
  "import.assignment": "असाइनमेंट",
  "import.kept": "अपने ऑफ़िसर के पास ही रहेंगे",
  "import.newAssigned": "नए असाइन हुए",
  "import.moved": "दूसरे ऑफ़िसर को गए",
  "import.unassigned": "इस पिनकोड पर कोई ऑफ़िसर नहीं",
  "import.unassignedHint": "ये आपकी कतार में रहेंगे, इन्हें हाथ से असाइन करें।",
  "import.byOfficer": "हर ऑफ़िसर के लोन",
  "import.errorTable": "ये पंक्तियाँ छोड़ी जाएँगी",
  "import.errorRow": "पंक्ति",
  "import.errorField": "कॉलम",
  "import.errorMessage": "समस्या",
  "import.commit": "इम्पोर्ट कमिट करें",
  "import.committing": "कमिट हो रहा है…",
  "import.done": "इम्पोर्ट कमिट हो गया",
  "import.doneBody": "{rows} लोन आज की सूचियों में हैं।",
  "import.promises": "वादों का नतीजा: {kept} पूरे, {partial} आंशिक, {broken} टूटे।",
  "import.another": "दूसरी फ़ाइल अपलोड करें",
  "import.history": "हाल के इम्पोर्ट",
  "import.historyEmpty": "अभी कोई इम्पोर्ट नहीं। पहले अपलोड से इतिहास शुरू होगा।",
  "import.showAll": "सभी {n} देखें",
  "import.showLess": "कम दिखाएँ",
  "import.col.date": "दिन",
  "import.col.file": "फ़ाइल",
  "import.col.status": "स्थिति",
  "import.col.rows": "पंक्तियाँ",
  "import.col.by": "किसने अपलोड किया",
  "import.status.PREVIEW": "कमिट नहीं हुआ",
  "import.status.COMMITTED": "कमिट हुआ",
  "import.status.SUPERSEDED": "बदल दिया गया",
  "import.status.FAILED": "विफल",
  "import.noFile": "पहले CSV फ़ाइल चुनें।",
  "import.notCsv": "यह CSV फ़ाइल नहीं है। ओवरड्यू सूची CSV में एक्सपोर्ट करके फिर कोशिश करें।",
  "import.tooBig": "फ़ाइल 8 MB से बड़ी है।",
};

const dictionaries = { en, hi } satisfies Record<string, Dictionary>;
export type Locale = keyof typeof dictionaries;

const STORAGE_KEY = "kisht.locale";

type Ctx = {
  locale: Locale;
  setLocale: (l: Locale) => void;
  t: (key: MessageKey, vars?: Record<string, string | number>) => string;
};

const LocaleContext = createContext<Ctx | null>(null);

export function LocaleProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>("hi");

  useEffect(() => {
    const saved = window.localStorage.getItem(STORAGE_KEY);
    if (saved === "hi" || saved === "en") setLocaleState(saved);
  }, []);

  useEffect(() => {
    document.documentElement.lang = locale;
  }, [locale]);

  const setLocale = useCallback((l: Locale) => {
    window.localStorage.setItem(STORAGE_KEY, l);
    setLocaleState(l);
  }, []);

  const value = useMemo<Ctx>(
    () => ({
      locale,
      setLocale,
      t: (key, vars) => {
        let s: string = dictionaries[locale][key];
        if (vars) for (const [k, v] of Object.entries(vars)) s = s.replaceAll(`{${k}}`, String(v));
        return s;
      },
    }),
    [locale, setLocale],
  );

  return <LocaleContext.Provider value={value}>{children}</LocaleContext.Provider>;
}

export function useI18n(): Ctx {
  const ctx = useContext(LocaleContext);
  if (!ctx) throw new Error("useI18n must be used inside LocaleProvider");
  return ctx;
}

/** Applies a user's saved preference the first time they sign in on this device. */
export function useDefaultLocale(userLocale: Locale | undefined) {
  const { setLocale } = useI18n();
  useEffect(() => {
    if (!userLocale) return;
    if (window.localStorage.getItem(STORAGE_KEY) === null) setLocale(userLocale);
  }, [userLocale, setLocale]);
}
