import { LogOut } from "lucide-react";
import { useLocation } from "wouter";
import { useAuth } from "./AuthProvider";
import { Button } from "../../components/ui/Button";

export function SignOutButton({
  className,
  onExit,
}: {
  className?: string;
  onExit?: () => void;
}) {
  const auth = useAuth();
  const [, navigate] = useLocation();
  if (auth.status !== "authenticated") return null;
  return (
    <Button
      data-navigate
      className={className}
      variant="outline"
      size="sm"
      onClick={() => {
        void auth.signOut();
        onExit?.();
        navigate("/auth");
      }}
    >
      <LogOut size={17} aria-hidden="true" />
      Sair da conta
    </Button>
  );
}
