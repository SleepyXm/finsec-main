"use client";
 
import { motion } from "framer-motion";
import MarketOverview from "./components/intradaymarket/marketoverview";
import { pageStyle } from "./components/UI/UI";
 
export default function Home() {
  return (
    <main style={pageStyle} className="min-h-screen w-full p-[5vw] pb-[10vh]">
      <div className="flex w-full flex-col gap-[4vh]">
        <motion.div
          initial={{ opacity: 0, y: -20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.6 }}
        >
          <h1 className="text-7xl font-semibold text-white w-full flex items-center justify-center whitespace-nowrap">
            Welcome to{" "}
            <svg
              width="auto"
              height="90"
              viewBox="0 0 500 80"
              className="inline align-middle"
            >
              <defs>
                <linearGradient id="grad1" x1="0%" y1="0%" x2="100%" y2="0%">
                  <stop offset="0%" stopColor="rgb(131, 165, 240)" />
                  <stop offset="100%" stopColor="rgb(186, 203, 247)" />
                </linearGradient>
              </defs>
              <text
                x="24"
                y="66"
                fontSize="68"
                fontWeight="bold"
                fill="url(#grad1)"
              >
                Finsec
              </text>
            </svg>
          </h1>
        </motion.div>

        <MarketOverview />
      </div>
    </main>
  );
}
