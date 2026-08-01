import { wareraFlagUrl } from "../lib/wareraMedia";

type Props = {
  code: string | null | undefined;
  className?: string;
};

export function FlagIcon({ code, className }: Props) {
  if (!code) return null;
  return (
    <img className={className ?? "flag-icon"} src={wareraFlagUrl(code)} alt="" draggable={false} />
  );
}
