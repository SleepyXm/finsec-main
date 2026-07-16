import { Metadata } from "next";
import Profile from "./ProfilePage";

export const metadata: Metadata = {
  title: "FinSec - Profile",
};

export default function ProfilePage() {
  return <Profile />;
}