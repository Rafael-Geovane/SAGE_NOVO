export type CartItem = { variantId: string; quantity: number };
let memory: CartItem[] = [];
export function readCart(raw: string | null): CartItem[] {
  try {
    const data: unknown = JSON.parse(raw ?? "[]");
    if (!Array.isArray(data)) return [];
    const seen = new Set<string>();
    return data
      .filter(
        (v): v is CartItem =>
          !!v &&
          typeof v === "object" &&
          ["navy", "white", "black"].includes(v.variantId) &&
          Number.isInteger(v.quantity) &&
          v.quantity >= 1 &&
          v.quantity <= 10,
      )
      .filter((v) => {
        if (seen.has(v.variantId)) return false;
        seen.add(v.variantId);
        return true;
      })
      .map(({ variantId, quantity }) => ({ variantId, quantity }));
  } catch {
    return [];
  }
}
export function getCart(): CartItem[] {
  try {
    return readCart(localStorage.getItem("sage-cart"));
  } catch {
    return memory;
  }
}
export function setCart(items: CartItem[]): boolean {
  memory = readCart(JSON.stringify(items));
  try {
    localStorage.setItem("sage-cart", JSON.stringify(memory));
    return true;
  } catch {
    return false;
  }
}
