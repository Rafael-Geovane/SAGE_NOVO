export function safeReturnTo(value: string | null): string {
  const allowed = [
    "/dashboard",
    "/admin",
    "/suporte",
    "/carrinho",
    "/suporte?intent=vest",
  ];
  return value && allowed.includes(value) ? value : "/dashboard";
}
