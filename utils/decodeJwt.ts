function base64UrlDecode(str: string) {
  // Reemplaza Base64URL por Base64 estándar y decodifica
  const base64 = str.replace(/-/g, "+").replace(/_/g, "/");
  // Añadir padding si es necesario
  const pad =
    base64.length % 4 === 0 ? "" : "=".repeat(4 - (base64.length % 4));
  const normalized = base64 + pad;

  // En Node usamos Buffer; en navegador usamos atob
  if (typeof window === "undefined") {
    return Buffer.from(normalized, "base64").toString("utf8");
  } else {
    return decodeURIComponent(
      Array.prototype.map
        .call(
          atob(normalized),
          (c) => "%" + ("00" + c.charCodeAt(0).toString(16)).slice(-2)
        )
        .join("")
    );
  }
}

export function decodeJWT(token: string) {
  if (!token) throw new Error("Token vacío");
  const parts = token.split(".");
  if (parts.length < 2) throw new Error("Token inválido");

  const header = JSON.parse(base64UrlDecode(parts[0]));
  const payload = JSON.parse(base64UrlDecode(parts[1]));
  // signature = parts[2] (no decodificamos normalmente)
  return { header, payload, signature: parts[2] || null };
}
