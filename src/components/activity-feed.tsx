"use client";

import { useEffect, useState } from "react";
import { Zap } from "lucide-react";
import { AnimatePresence, motion } from "framer-motion";

interface ActivityItem {
  id: string;
  user: string;
  trader: string;
  symbol: string;
  amount: number;
  timestamp: string;
}

function timeAgo(ts: string): string {
  const diff = Date.now() - new Date(ts).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
}

export function ActivityFeed() {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [index, setIndex] = useState(0);

  useEffect(() => {
    fetch("/api/activity")
      .then((r) => r.json())
      .then((d) => {
        if (d.success && d.data?.length) setItems(d.data);
      })
      .catch(() => {});
  }, []);

  // Rotate every 4 seconds
  useEffect(() => {
    if (items.length <= 1) return;
    const interval = setInterval(() => {
      setIndex((prev) => (prev + 1) % items.length);
    }, 4000);
    return () => clearInterval(interval);
  }, [items.length]);

  if (items.length === 0) return null;

  const current = items[index];

  return (
    <div className="w-full">
      <div className="relative h-10 flex items-center overflow-hidden border border-[#222] bg-[#0A0A0A] px-4">
        <Zap className="h-3 w-3 text-lime mr-3 shrink-0" />
        <AnimatePresence mode="wait">
          <motion.div
            key={current.id}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -10 }}
            transition={{ duration: 0.2 }}
            className="text-xs text-muted-foreground truncate"
          >
            <span className="text-foreground font-medium">{current.user}</span>{" "}
            copied{" "}
            <span className="text-foreground font-medium">{current.trader}</span>{" "}
            on{" "}
            <span className="text-lime font-medium">{current.symbol}</span>{" "}
            with{" "}
            <span className="text-foreground font-medium">${current.amount}</span>
            <span className="text-muted-foreground/50 ml-2">{timeAgo(current.timestamp)}</span>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
