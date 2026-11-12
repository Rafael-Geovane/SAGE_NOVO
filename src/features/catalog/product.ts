import navy from "../../../assets/sage_vest_azul_marinho.png";
import white from "../../../assets/sage_vest_branco_gelo.png";
import black from "../../../assets/sage_vest_preto_onix.png";
export const variants = [
  { id: "navy", name: "Azul-marinho", color: "#25334c", image: navy },
  { id: "white", name: "Branco", color: "#f5f5f5", image: white },
  { id: "black", name: "Preto", color: "#202123", image: black },
] as const;
export const product: {
  name: string;
  price: number | null;
  commerciallyAvailable: boolean;
  availabilityLabel: string;
} = {
  name: "SAGE Smart Vest",
  price: null,
  commerciallyAvailable: false,
  availabilityLabel: "Em desenvolvimento",
};
