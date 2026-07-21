import { Metadata } from "next";
import DashboardPage from "./Dashboard"; // your existing component

export const metadata: Metadata = {
  title: "FinSec - User Dashboard",
};

export default function Dashboard() {
  return <DashboardPage />;
}