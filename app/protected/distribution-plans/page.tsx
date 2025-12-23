import { Button, Space } from "antd";
import { CalendarOutlined } from "@ant-design/icons";
import { createClient } from "@/lib/supabase/server";
import { listDistributionPlans } from "./services/listDistributionPlans";
import DistributionPlansTable from "./components/DistributionPlansTable";

async function DistributionPlansPage() {
  const supabase = await createClient();
  const data = await listDistributionPlans(supabase);

  return (
    <>
      <Space style={{ marginBottom: 16 }}>
        <Button
          href="/protected/distribution-plans/calendar"
          icon={<CalendarOutlined />}
        >
          Calendario
        </Button>
      </Space>
      <DistributionPlansTable data={data.reverse()} />
    </>
  );
};

export default DistributionPlansPage;

