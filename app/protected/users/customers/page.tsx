import { Table } from "antd";
import { listCustomers } from "./services/listCustomers";
import { createClient } from "@/lib/supabase/server";

interface CustomerRow {
  id: string;
  name: string;
  email?: string;
  phone?: string;
}

async function Index() {
  const supabase = await createClient();
  const data = await listCustomers(supabase);

  const columns = [
    { title: "Nombre", dataIndex: "name", key: "name" },
    {
      title: "Tipo de Identificación",
      dataIndex: "identification_type",
      key: "identification_type",
    },
    {
      title: "Número de Identificación",
      dataIndex: "identification_number",
      key: "identification_number",
    },
    { title: "Contacto", dataIndex: "contact", key: "contact" },
    { title: "Teléfono", dataIndex: "phone", key: "phone" },
  ];

  return (
    <div>
      <Table<CustomerRow> rowKey="id" columns={columns} dataSource={data} />
    </div>
  );
}

export default Index;
