import { InfoIcon } from "lucide-react";
import { FetchDataSteps } from "@/components/tutorial/fetch-data-steps";
import { Suspense } from "react";
import { UserDetails } from "./components/UserDetails";
import { Card, Layout, Tag, Typography } from "antd";
import { createClient } from "@/lib/supabase/server";
import Link from "next/link";
import { ArrowRightOutlined } from "@ant-design/icons";
import DistributionPlanStatusTag from "./components/DistributionPlanStatusTag";

export default async function ProtectedPage() {
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("distribution_plan")
    .select("id, plan_code, plan_date, status, notes")
    .order("plan_date", { ascending: true })
    .in("status", ["in_progress", "preparing"]);

  if (error) throw error;

  return (
    <Layout
      style={{
        padding: "16px",
        width: "100%",
      }}
    >
      <Card
        style={{ width: "fit-content", overflow: "auto" }}
        title="Planes activos"
      >
        <div style={{ display: "inline-flex", gap: "8px", flexWrap: "wrap" }}>
          {data && data.length > 0
            ? data.map((plan) => {
                return (
                  <Card
                    title={
                      <div style={{ display: "inline-flex", gap: "8px" }}>
                        <h4>{plan.plan_date}</h4>
                        <p>~</p>
                        <p>{plan.plan_code}</p>
                      </div>
                    }
                    key={plan.id}
                  >
                    <DistributionPlanStatusTag status={plan.status} />
                    <p>{plan.notes}</p>
                    <Link
                      href={`/protected/distribution-plans/${plan.id}`}
                      style={{
                        marginTop: "8px",
                        display: "flex",
                        justifyContent: "end",
                      }}
                    >
                      Ir al editor <ArrowRightOutlined />
                    </Link>
                  </Card>
                );
              })
            : null}
        </div>
      </Card>
    </Layout>
  );
}
