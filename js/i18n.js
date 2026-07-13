/**
 * i18n.js
 * Minimal multi-language support. Elements marked with data-i18n="key"
 * get their textContent replaced; data-i18n-placeholder for input placeholders.
 */

const I18N = {
  current: CONFIG.DEFAULT_LANGUAGE,

  dict: {
    en: {
      appTitle: "Paunawa",
      tagline: "Crowdsourced real-time emergency reporting",
      reportIncident: "Report Incident",
      dashboard: "Dashboard",
      map: "Map",
      search: "Search reports…",
      filters: "Filters",
      allTypes: "All Types",
      allStatuses: "All Statuses",
      description: "Description",
      emergencyType: "Emergency Type",
      status: "Status",
      photos: "Photos",
      reporterAlias: "Your Alias (optional)",
      useMyLocation: "Use My Location",
      submit: "Submit Report",
      cancel: "Cancel",
      activeIncidents: "Active Incidents",
      recentReports: "Recent Reports",
      mostVerified: "Most Verified",
      exportCsv: "Export CSV",
      exportJson: "Export JSON",
      sosMode: "SOS",
      offlineQueued: "Saved offline — will sync automatically",
      editReport: "Edit Report",
      history: "Version History",
      verify: "Verify",
      shareLink: "Share Link",
    },
    es: {
      appTitle: "Paunawa",
      tagline: "Reportes de emergencia en tiempo real colaborativos",
      reportIncident: "Reportar Incidente",
      dashboard: "Panel",
      map: "Mapa",
      search: "Buscar reportes…",
      filters: "Filtros",
      allTypes: "Todos los Tipos",
      allStatuses: "Todos los Estados",
      description: "Descripción",
      emergencyType: "Tipo de Emergencia",
      status: "Estado",
      photos: "Fotos",
      reporterAlias: "Tu Alias (opcional)",
      useMyLocation: "Usar Mi Ubicación",
      submit: "Enviar Reporte",
      cancel: "Cancelar",
      activeIncidents: "Incidentes Activos",
      recentReports: "Reportes Recientes",
      mostVerified: "Más Verificados",
      exportCsv: "Exportar CSV",
      exportJson: "Exportar JSON",
      sosMode: "SOS",
      offlineQueued: "Guardado sin conexión — se sincronizará automáticamente",
      editReport: "Editar Reporte",
      history: "Historial de Versiones",
      verify: "Verificar",
      shareLink: "Compartir Enlace",
    },
    fr: {
      appTitle: "Paunawa",
      tagline: "Signalement d'urgences en temps réel participatif",
      reportIncident: "Signaler un Incident",
      dashboard: "Tableau de Bord",
      map: "Carte",
      search: "Rechercher…",
      filters: "Filtres",
      allTypes: "Tous les Types",
      allStatuses: "Tous les Statuts",
      description: "Description",
      emergencyType: "Type d'Urgence",
      status: "Statut",
      photos: "Photos",
      reporterAlias: "Votre Alias (facultatif)",
      useMyLocation: "Utiliser Ma Position",
      submit: "Envoyer le Rapport",
      cancel: "Annuler",
      activeIncidents: "Incidents Actifs",
      recentReports: "Rapports Récents",
      mostVerified: "Les Plus Vérifiés",
      exportCsv: "Exporter CSV",
      exportJson: "Exporter JSON",
      sosMode: "SOS",
      offlineQueued: "Enregistré hors ligne — synchronisation automatique",
      editReport: "Modifier le Rapport",
      history: "Historique des Versions",
      verify: "Vérifier",
      shareLink: "Partager le Lien",
    },
    ar: {
      appTitle: "Paunawa",
      tagline: "الإبلاغ الجماعي عن الطوارئ في الوقت الفعلي",
      reportIncident: "الإبلاغ عن حادث",
      dashboard: "لوحة المعلومات",
      map: "الخريطة",
      search: "بحث في التقارير…",
      filters: "عوامل التصفية",
      allTypes: "جميع الأنواع",
      allStatuses: "جميع الحالات",
      description: "الوصف",
      emergencyType: "نوع الطارئ",
      status: "الحالة",
      photos: "الصور",
      reporterAlias: "اسمك المستعار (اختياري)",
      useMyLocation: "استخدام موقعي",
      submit: "إرسال التقرير",
      cancel: "إلغاء",
      activeIncidents: "الحوادث النشطة",
      recentReports: "أحدث التقارير",
      mostVerified: "الأكثر تحققاً",
      exportCsv: "تصدير CSV",
      exportJson: "تصدير JSON",
      sosMode: "طوارئ",
      offlineQueued: "تم الحفظ دون اتصال — ستتم المزامنة تلقائياً",
      editReport: "تعديل التقرير",
      history: "سجل الإصدارات",
      verify: "تحقق",
      shareLink: "مشاركة الرابط",
    },
    tl: {
      appTitle: "Paunawa",
      tagline: "Real-time na pag-uulat ng emerhensiya mula sa publiko",
      reportIncident: "Mag-ulat ng Insidente",
      dashboard: "Dashboard",
      map: "Mapa",
      search: "Maghanap ng ulat…",
      filters: "Mga Filter",
      allTypes: "Lahat ng Uri",
      allStatuses: "Lahat ng Status",
      description: "Deskripsyon",
      emergencyType: "Uri ng Emerhensiya",
      status: "Status",
      photos: "Mga Larawan",
      reporterAlias: "Iyong Alias (opsyonal)",
      useMyLocation: "Gamitin ang Aking Lokasyon",
      submit: "Isumite ang Ulat",
      cancel: "Kanselahin",
      activeIncidents: "Aktibong Insidente",
      recentReports: "Kamakailang Ulat",
      mostVerified: "Pinaka-Verified",
      exportCsv: "I-export bilang CSV",
      exportJson: "I-export bilang JSON",
      sosMode: "SOS",
      offlineQueued: "Naka-save offline — awtomatikong mag-sy-sync",
      editReport: "I-edit ang Ulat",
      history: "History ng mga Bersyon",
      verify: "I-verify",
      shareLink: "Ibahagi ang Link",
    },
  },

  t(key) {
    return (I18N.dict[I18N.current] && I18N.dict[I18N.current][key]) || I18N.dict.en[key] || key;
  },

  setLanguage(lang) {
    if (!CONFIG.LANGUAGES.includes(lang)) lang = CONFIG.DEFAULT_LANGUAGE;
    I18N.current = lang;
    localStorage.setItem("ca_lang", lang);
    document.documentElement.setAttribute("lang", lang);
    document.documentElement.setAttribute("dir", lang === "ar" ? "rtl" : "ltr");
    I18N.applyToDom();
  },

  applyToDom() {
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      el.textContent = I18N.t(el.getAttribute("data-i18n"));
    });
    document.querySelectorAll("[data-i18n-placeholder]").forEach((el) => {
      el.setAttribute("placeholder", I18N.t(el.getAttribute("data-i18n-placeholder")));
    });
  },

  init() {
    const saved = localStorage.getItem("ca_lang") || CONFIG.DEFAULT_LANGUAGE;
    I18N.setLanguage(saved);
    const select = document.getElementById("languageSelect");
    if (select) {
      select.value = saved;
      select.addEventListener("change", (e) => I18N.setLanguage(e.target.value));
    }
  },
};
