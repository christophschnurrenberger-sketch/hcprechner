"use client";

import { useState } from "react";
import type { ZodType } from "zod";
import { ApiError, userMessage } from "@/lib/api/errors";
import { fieldErrors } from "@/lib/auth/validation";

/** Feld- und Formularfehler aus der Prüfung im Browser (UX) oder aus der API-Antwort (verbindlich). */
export function useFormErrors() {
  const [fields, setFields] = useState<Record<string, string>>({});
  const [form, setForm] = useState<string | null>(null);

  function fromError(error: unknown) {
    if (error instanceof ApiError && error.fields && Object.keys(error.fields).length > 0) {
      setFields(error.fields);
      setForm(error.code === "VALIDATION" ? null : userMessage(error));
    } else {
      setFields({});
      setForm(userMessage(error));
    }
  }

  /**
   * Prüft Eingaben mit einem Zod-Schema; liefert die Daten oder null (Fehler werden gesetzt).
   * `extra` ergänzt Prüfungen, die Zod bei anderen Feldfehlern überspringt (z. B. Passwort-Wiederholung).
   */
  function validate<T>(schema: ZodType<T>, data: unknown, extra: Record<string, string | false | null | undefined> = {}): T | null {
    const res = schema.safeParse(data);
    const more = Object.fromEntries(Object.entries(extra).filter((e): e is [string, string] => typeof e[1] === "string"));
    if (res.success && Object.keys(more).length === 0) {
      setFields({});
      setForm(null);
      return res.data;
    }
    setFields({ ...more, ...(res.success ? {} : fieldErrors(res.error)) });
    setForm(null);
    return null;
  }

  function clear() {
    setFields({});
    setForm(null);
  }

  return { fields, form, setForm, fromError, validate, clear };
}

export { safeNext } from "@/lib/auth/redirect";
