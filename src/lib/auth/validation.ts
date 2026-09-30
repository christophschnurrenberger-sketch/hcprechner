/**
 * Eingabeprüfung für Registrierung, Anmeldung und Konto (Frontend für die UX, Backend verbindlich).
 * Die PHP-Edition prüft dieselben Regeln (api/_lib.php: hcp_check_*).
 */
import { z } from "zod";

export const PASSWORD_MIN_LENGTH = 8;
export const PASSWORD_MAX_LENGTH = 200;
export const NAME_MAX_LENGTH = 60;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const EMAIL_MESSAGE = "Bitte eine gültige E-Mail-Adresse eingeben.";

export const emailSchema = z.string().trim().toLowerCase().max(200, "Die E-Mail-Adresse ist zu lang.").regex(EMAIL_PATTERN, EMAIL_MESSAGE);

/**
 * Benutzername für Konten ohne E-Mail-Adresse (legt nur der Admin an). Klein geschrieben, ohne „@“ – so ist bei der
 * Anmeldung eindeutig, ob eine E-Mail-Adresse oder ein Benutzername gemeint ist. PHP: HCP_USERNAME_PATTERN.
 */
export const USERNAME_PATTERN = /^[a-z0-9][a-z0-9._-]{2,31}$/;
export const USERNAME_RULE = "3–32 Zeichen: Buchstaben a–z (ohne Umlaute), Ziffern sowie . _ - (am Anfang ein Buchstabe oder eine Ziffer).";
export const usernameSchema = z.string().trim().toLowerCase().regex(USERNAME_PATTERN, USERNAME_RULE);

export const passwordSchema = z
  .string()
  .min(PASSWORD_MIN_LENGTH, `Mindestens ${PASSWORD_MIN_LENGTH} Zeichen.`)
  .max(PASSWORD_MAX_LENGTH, "Das Passwort ist zu lang.");

const nameSchema = (label: string) =>
  z.string().trim().min(1, `Bitte ${label} eingeben.`).max(NAME_MAX_LENGTH, `${label} ist zu lang.`);

/** Optionaler Start-HCPI (Dezimalkomma erlaubt). */
export const handicapInputSchema = z
  .union([z.number(), z.string()])
  .transform((v) => (typeof v === "string" ? (v.trim() === "" ? null : Number(v.replace(",", "."))) : v))
  .refine((v) => v === null || (Number.isFinite(v) && v >= -10 && v <= 54), "Handicap zwischen +10 und 54,0.")
  .nullable()
  .optional()
  .transform((v) => (v === undefined ? null : v));

export const registerSchema = z
  .object({
    firstName: nameSchema("den Vornamen"),
    lastName: nameSchema("den Nachnamen"),
    email: emailSchema,
    password: passwordSchema,
    passwordRepeat: z.string(),
    handicapIndex: handicapInputSchema,
    acceptTerms: z.literal(true, { error: "Bitte akzeptiere Datenschutz und Nutzungsbedingungen." }),
  })
  .refine((v) => v.password === v.passwordRepeat, { path: ["passwordRepeat"], message: "Die Passwörter stimmen nicht überein." });
export type RegisterInput = z.infer<typeof registerSchema>;

export const loginSchema = z.object({
  /** E-Mail-Adresse oder – bei vom Admin angelegten Konten ohne E-Mail – der Benutzername. */
  email: z.string().trim().toLowerCase().min(1, "Bitte E-Mail-Adresse oder Benutzername eingeben."),
  password: z.string().min(1, "Bitte das Passwort eingeben."),
});
export type LoginInput = z.infer<typeof loginSchema>;

export const resetPasswordSchema = z
  .object({ token: z.string().min(10), password: passwordSchema, passwordRepeat: z.string() })
  .refine((v) => v.password === v.passwordRepeat, { path: ["passwordRepeat"], message: "Die Passwörter stimmen nicht überein." });

export const changePasswordSchema = z
  .object({ currentPassword: z.string().min(1, "Bitte das aktuelle Passwort eingeben."), newPassword: passwordSchema, newPasswordRepeat: z.string() })
  .refine((v) => v.newPassword === v.newPasswordRepeat, { path: ["newPasswordRepeat"], message: "Die Passwörter stimmen nicht überein." })
  .refine((v) => v.newPassword !== v.currentPassword, { path: ["newPassword"], message: "Das neue Passwort muss sich vom bisherigen unterscheiden." });

export const profileSchema = z.object({
  firstName: nameSchema("den Vornamen"),
  lastName: nameSchema("den Nachnamen"),
  /** leer nur bei Konten mit Benutzername und ohne E-Mail-Adresse (eine vorhandene Adresse bleibt bestehen) */
  email: z
    .string()
    .trim()
    .toLowerCase()
    .max(200, "Die E-Mail-Adresse ist zu lang.")
    .refine((v) => v === "" || EMAIL_PATTERN.test(v), EMAIL_MESSAGE),
  /** nur nötig, wenn sich die E-Mail-Adresse ändert */
  currentPassword: z.string().optional(),
});
export type ProfileInput = z.infer<typeof profileSchema>;

/** Zod-Fehler → { feld: meldung } für die Anzeige direkt am Feld. */
export function fieldErrors(error: z.ZodError): Record<string, string> {
  const out: Record<string, string> = {};
  for (const issue of error.issues) {
    const key = issue.path.join(".") || "form";
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
