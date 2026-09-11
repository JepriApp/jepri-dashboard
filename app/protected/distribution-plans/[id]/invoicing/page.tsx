"use client";
import { useParams } from "next/navigation";
import InvoicingReviewTable from "./components/InvoicingReviewTable";

const InvoicingPage = () => {
  const params = useParams();
  const planId = params.id as string | undefined;
  if (!planId) {
    return null;
  }
  return <InvoicingReviewTable id={planId} />;
};

export default InvoicingPage;
