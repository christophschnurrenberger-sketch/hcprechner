"use client";

import { useTransition, type FormEvent } from "react";

/**
 * Formular absenden, ohne dass React die Eingaben zurücksetzt.
 * (`<form action={…}>` leert unkontrollierte Felder nach jeder Aktion – auch wenn die Aktion
 * einen Validierungsfehler zurückgibt; die Eingaben sollen dann erhalten bleiben.)
 */
export function useKeepValuesSubmit(dispatch: (fd: FormData) => void) {
  const [, startTransition] = useTransition();
  return (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    const fd = new FormData(e.currentTarget);
    startTransition(() => dispatch(fd));
  };
}
