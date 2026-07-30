"use client";

import { useState } from "react";
import { QuantityStepper } from "@/app/UI/client";
import type { RawData } from "@/app/components/types/charts";
import {
  MAX_TRADE_QUANTITY,
  type OrderIntent,
  type OrderType,
} from "@/app/components/types/trades";
import styles from "./TradeButtons.module.css";

interface TradeButtonsProps {
  data?: Pick<RawData, "close" | "buy_price"> | null;
  onTrade: (
    action: "buy" | "sell",
    quantity: number,
    order: OrderIntent,
  ) => void;
  quantity: number;
  onQuantityChange: (quantity: number) => void;
  disabled?: boolean;
  allowLimitOrders?: boolean;
}

function priceNumber(value: number | string | null | undefined) {
  const numeric = typeof value === "string" ? Number(value) : value;
  return typeof numeric === "number" && Number.isFinite(numeric) ? numeric : null;
}

function priceDisplay(value: number | null) {
  if (value == null || !Number.isFinite(value)) return "—";
  return value.toLocaleString(undefined, {
    minimumFractionDigits: 2,
    maximumFractionDigits: 5,
  });
}

export default function TradeButtons({
  data,
  onTrade,
  quantity,
  onQuantityChange,
  disabled = false,
  allowLimitOrders = true,
}: TradeButtonsProps) {
  const [expanded, setExpanded] = useState(false);
  const [orderType, setOrderType] = useState<OrderType>("market");
  const [limitPrice, setLimitPrice] = useState("");
  const bid = priceNumber(data?.close);
  const ask = priceNumber(data?.buy_price);

  if (!data) return null;

  const activeOrderType = allowLimitOrders ? orderType : "market";
  const parsedLimit = Number(limitPrice);
  const limitReady = activeOrderType === "market"
    || (limitPrice !== "" && Number.isFinite(parsedLimit) && parsedLimit > 0);
  const quickTradeUnavailable = disabled || bid == null || ask == null;
  const unavailable = disabled || bid == null || ask == null || !limitReady;
  const order: OrderIntent = activeOrderType === "limit"
    ? { orderType: activeOrderType, limitPrice: parsedLimit }
    : { orderType: activeOrderType };

  function selectOrderType(next: OrderType) {
    setOrderType(next);
    if (next === "limit" && limitPrice === "" && bid != null) {
      setLimitPrice(String(bid));
    }
  }

  if (!expanded) {
    return (
      <section className={styles.quickBar} aria-label="Quick trade">
        <button
          type="button"
          disabled={quickTradeUnavailable}
          onClick={() => onTrade("sell", quantity, { orderType: "market" })}
          className={styles.sellButton}
        >
          <span>Sell</span>
          <strong>{priceDisplay(bid)}</strong>
        </button>
        <QuantityStepper
          value={quantity}
          onChange={onQuantityChange}
          max={MAX_TRADE_QUANTITY}
        />
        <button
          type="button"
          disabled={quickTradeUnavailable}
          onClick={() => onTrade("buy", quantity, { orderType: "market" })}
          className={styles.buyButton}
        >
          <span>Buy</span>
          <strong>{priceDisplay(ask)}</strong>
        </button>
        <button
          type="button"
          className={styles.expandButton}
          onClick={() => setExpanded(true)}
          aria-label="Open order ticket"
          title="Open order ticket"
        >
          •••
        </button>
      </section>
    );
  }

  return (
    <section className={styles.ticket} aria-label="Order ticket">
      <div className={styles.header}>
        <span className={styles.title}>Order</span>
        <div className={styles.headerActions}>
          <div className={styles.tabs} aria-label="Order type">
            <button
              type="button"
              className={activeOrderType === "market" ? styles.activeTab : styles.tab}
              onClick={() => selectOrderType("market")}
            >
              Market
            </button>
            {allowLimitOrders && (
              <button
                type="button"
                className={activeOrderType === "limit" ? styles.activeTab : styles.tab}
                onClick={() => selectOrderType("limit")}
              >
                Limit
              </button>
            )}
          </div>
          <button
            type="button"
            className={styles.collapseButton}
            onClick={() => setExpanded(false)}
            aria-label="Close order ticket"
            title="Close order ticket"
          >
            ×
          </button>
        </div>
      </div>

      <div className={styles.quoteRow}>
        <span>
          <small>Bid</small>
          <strong>{priceDisplay(bid)}</strong>
        </span>
        <span className={styles.spread}>
          {bid != null && ask != null ? priceDisplay(ask - bid) : "—"}
        </span>
        <span>
          <small>Ask</small>
          <strong>{priceDisplay(ask)}</strong>
        </span>
      </div>

      <div className={styles.controls}>
        <label className={styles.control}>
          <span>Quantity</span>
          <QuantityStepper
            value={quantity}
            onChange={onQuantityChange}
            max={MAX_TRADE_QUANTITY}
          />
        </label>

        {activeOrderType === "limit" && (
          <label className={styles.control}>
            <span>Limit price</span>
            <input
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              value={limitPrice}
              onChange={(event) => setLimitPrice(event.target.value)}
              className={styles.priceInput}
              aria-label="Limit price"
            />
          </label>
        )}
      </div>

      <div className={styles.actions}>
        <button
          type="button"
          disabled={unavailable}
          onClick={() => onTrade("sell", quantity, order)}
          className={styles.sellButton}
        >
          <span>{activeOrderType === "limit" ? "Sell limit" : "Sell"}</span>
          <strong>{priceDisplay(activeOrderType === "limit" ? parsedLimit : bid)}</strong>
        </button>
        <button
          type="button"
          disabled={unavailable}
          onClick={() => onTrade("buy", quantity, order)}
          className={styles.buyButton}
        >
          <span>{activeOrderType === "limit" ? "Buy limit" : "Buy"}</span>
          <strong>{priceDisplay(activeOrderType === "limit" ? parsedLimit : ask)}</strong>
        </button>
      </div>

      {activeOrderType === "limit" && (
        <p className={styles.hint}>
          Buy at or below the ask · Sell at or above the bid
        </p>
      )}
    </section>
  );
}
