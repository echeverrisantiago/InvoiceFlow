/**
 * Versión vigente de los documentos legales.
 *
 * Cada vez que cambie el texto de Términos o Privacidad hay que:
 *   1. Bumpear la fecha/versión aquí (y en el "Última actualización" de la página).
 *   2. Ejecutar `npm run legal:hash` para recalcular los hashes.
 * El test `__tests__/legal-version.test.ts` falla si el texto cambia y no se hace.
 */

export const LEGAL_EFFECTIVE_DATE = '2026-10-18';

export const TERMS_VERSION = LEGAL_EFFECTIVE_DATE;
export const PRIVACY_VERSION = LEGAL_EFFECTIVE_DATE;

// SHA-256 del contenido exacto de app/terminos/page.tsx y app/privacidad/page.tsx.
// Permite probar qué texto aceptó cada usuario sin almacenar el documento completo.
export const TERMS_HASH =
  '913be7f5af46003b52bd18b204cb7f575b97fc13c6ab11900460bed26b5aa8c8';
export const PRIVACY_HASH =
  'f60d44cd57465542c5ad4b562749f6c708ac2eae7502efa595b2669dee2c692a';

export interface AcceptanceVersions {
  termsVersion: string;
  privacyVersion: string;
}

/** Indica si una aceptación corresponde a la versión vigente de ambos documentos. */
export function isCurrentAcceptance(
  acceptance?: AcceptanceVersions | null
): boolean {
  if (!acceptance) return false;
  return (
    acceptance.termsVersion === TERMS_VERSION &&
    acceptance.privacyVersion === PRIVACY_VERSION
  );
}
