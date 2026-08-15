"use client";
 
import { motion } from "framer-motion";
import MarketOverview from "./components/intradaymarket/marketoverview";
import { pageStyle } from "@/app/UI";
 
export default function Home() {
  return (
    <main style={pageStyle} className="min-h-screen w-full px-[5vw] pb-[10vh] pt-[7vh]">
      <div className="flex w-full flex-col gap-[4vh]">
        <motion.section
          aria-labelledby="finsec-welcome"
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
          className="relative isolate flex min-h-[260px] w-full items-center justify-center overflow-hidden border border-white/[0.08] bg-[linear-gradient(135deg,rgba(238,242,247,0.045),rgba(14,17,23,0.22)_55%,rgba(143,170,220,0.08))] px-6 py-12 sm:min-h-[320px] sm:px-10"
        >
          <div
            aria-hidden="true"
            className="absolute inset-0 -z-10 opacity-30 [background-image:linear-gradient(rgba(238,242,247,0.055)_1px,transparent_1px),linear-gradient(90deg,rgba(238,242,247,0.055)_1px,transparent_1px)] [background-size:52px_52px] [mask-image:linear-gradient(to_right,transparent,black_30%,black_70%,transparent)]"
          />
          <div
            aria-hidden="true"
            className="absolute left-1/2 top-1/2 -z-10 h-48 w-48 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[#8faadc]/15 blur-3xl sm:h-64 sm:w-64"
          />

          <span aria-hidden="true" className="absolute left-0 top-0 h-6 w-6 border-l border-t border-[#8faadc]/60" />
          <span aria-hidden="true" className="absolute right-0 top-0 h-6 w-6 border-r border-t border-[#8faadc]/60" />
          <span aria-hidden="true" className="absolute bottom-0 left-0 h-6 w-6 border-b border-l border-[#8faadc]/60" />
          <span aria-hidden="true" className="absolute bottom-0 right-0 h-6 w-6 border-b border-r border-[#8faadc]/60" />

          <div className="relative flex flex-col items-center gap-5 text-center">
            <p className="font-mono text-[0.65rem] font-medium uppercase tracking-[0.34em] text-white/40 sm:text-xs">
              Financial intelligence
            </p>

            <h1
              id="finsec-welcome"
              className="flex flex-wrap items-center justify-center gap-x-5 gap-y-4 text-[clamp(2.6rem,6vw,5rem)] font-semibold leading-none tracking-[-0.045em] text-white"
            >
              <span className="text-white/85">Welcome to</span>
              <span className="inline-flex items-center gap-3 sm:gap-4">
                <span
                  aria-hidden="true"
                  className="relative grid size-[1.12em] shrink-0 place-items-center overflow-hidden border border-[#b9caf0]/35 bg-[linear-gradient(145deg,#111927,#080c13)] shadow-[0_0_0_5px_rgba(143,170,220,0.04),0_18px_50px_rgba(0,0,0,0.35)]"
                >
                  <span className="absolute inset-0 bg-[radial-gradient(circle_at_68%_24%,rgba(143,170,220,0.2),transparent_40%)]" />
                  <span className="relative flex -skew-x-[10deg] items-baseline justify-center font-sans leading-none">
                    <span className="text-[0.78em] font-bold tracking-[-0.1em] text-[#eef2f7]">
                      F
                    </span>
                    <span className="-ml-[0.13em] text-[0.78em] font-bold tracking-[-0.1em] text-[#8faadc]">
                      i
                    </span>
                  </span>
                </span>
                <span className="bg-gradient-to-r from-[#8faadc] via-[#b2c3e8] to-[#eef2f7] bg-clip-text pr-[0.04em] text-transparent">
                  Finsec
                </span>
              </span>
            </h1>

            <p className="max-w-xl text-sm tracking-[0.08em] text-white/45 sm:text-base">
              Read the market. Build the edge.
            </p>
          </div>
        </motion.section>

        <MarketOverview />
      </div>
    </main>
  );
}
