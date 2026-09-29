import { BASE_PATH } from "@/lib/runtime";

/** Oberste Seitenordner – daraus wird vor der Installation der Installationsordner ermittelt. */
const TOP_LEVEL_ROUTES = [
  "member",
  "admin",
  "login",
  "register",
  "forgot-password",
  "reset-password",
  "verify-email",
  "datenschutz",
  "impressum",
  "hilfe",
  "golfplaetze",
  "methodik",
];

/**
 * Webspace-Edition: Solange install.php den Basispfad-Platzhalter nicht ersetzt hat,
 * leitet jede Seite zur Installation um (statt ungestylt ohne Skripte zu erscheinen).
 * Der Vergleichswert ist zerlegt, damit install.php ihn nicht mit ersetzt.
 */
export function InstallGuard() {
  const script = `(function(){var b=${JSON.stringify(BASE_PATH)};if(b.indexOf("__HCP_"+"BASE__")<0)return;var r=${JSON.stringify(TOP_LEVEL_ROUTES)};var s=location.pathname.split("/");var i=1;for(;i<s.length;i++){if(r.indexOf(s[i])>=0)break;}var p=s.slice(0,i);if(p.length>1&&p[p.length-1].indexOf(".")>=0)p.pop();location.replace(p.join("/").replace(/\\/$/,"")+"/install.php");})();`;
  return <script dangerouslySetInnerHTML={{ __html: script }} />;
}
