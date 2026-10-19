import {
  Utensils,
  ShoppingBasket,
  Car,
  BookOpen,
  Repeat,
  Film,
  ShoppingBag,
  Circle,
  Gift,
  BriefcaseBusiness,
  Coffee,
  Heart,
  House,
  Smartphone,
  Music,
  TrainFront,
  type LucideIcon,
} from "lucide-react";
const map: Record<string, LucideIcon> = {
  utensils: Utensils,
  basket: ShoppingBasket,
  car: Car,
  book: BookOpen,
  repeat: Repeat,
  film: Film,
  bag: ShoppingBag,
  circle: Circle,
  gift: Gift,
  briefcase: BriefcaseBusiness,
  coffee: Coffee,
  heart: Heart,
  home: House,
  phone: Smartphone,
  music: Music,
  train: TrainFront,
};
export function CategoryIcon({
  name,
  size = 22,
}: {
  name: string;
  size?: number;
}) {
  const Icon = map[name] || Circle;
  return <Icon size={size} strokeWidth={1.5} aria-hidden="true" />;
}
