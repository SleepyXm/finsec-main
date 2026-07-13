import { cx } from "../classnames";

type TraderButtonClassOptions = {
  rounded?: boolean;
  inactive?: boolean;
  fullWidth?: boolean;
};

const base = "inline-flex h-11 items-center justify-center px-4 text-sm font-semibold uppercase tracking-[0.08em] transition duration-150";
const primary = "bg-[#EEF2F7] text-[#0E1117] hover:bg-[#DDE2EA] disabled:cursor-not-allowed disabled:border disabled:border-white/[0.09] disabled:bg-white/[0.045] disabled:text-white/35";
const inactive = "cursor-not-allowed border border-white/[0.09] bg-white/[0.045] text-white/35";

export const traderButtonClassName = ({ rounded = false, inactive: isInactive = false, fullWidth = true }: TraderButtonClassOptions = {}) =>
  cx(base, fullWidth && "w-full", isInactive ? inactive : primary, rounded && "rounded-full");

export const traderWhiteButtonClassName = traderButtonClassName();
export const traderWhiteRoundedButtonClassName = traderButtonClassName({ rounded: true });
export const traderInactiveButtonClassName = traderButtonClassName({ inactive: true });
export const traderInactiveRoundedButtonClassName = traderButtonClassName({ inactive: true, rounded: true });
