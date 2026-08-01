import { wareraItemUrl } from "../lib/wareraMedia";

type Props = {
  itemCode: string;
  className?: string;
};

export function ItemIcon({ itemCode, className }: Props) {
  return (
    <img
      className={className ?? "item-icon"}
      src={wareraItemUrl(itemCode)}
      alt=""
      draggable={false}
    />
  );
}
