"use client";
import { Button, Space, Table, Tag, Tooltip, Typography } from "antd";
import { listCustomers } from "./services/listCustomers";
import { createClient } from "@/lib/supabase/client";
import { Database } from "@/database.types";
import { useIsAdmin } from "@/lib/hooks/useIsAdmin";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import CreateCustomerModal from "./components/createCustomerModal";
import EditCustomerModal, {
  EditableCustomer,
} from "./components/EditCustomerModal";

interface CustomerRow extends EditableCustomer {
  contact: string | null;
}

interface PendingChangeRequest {
  id: string;
  customer_id: string;
  requested_data: Record<string, string | null>;
}

const FIELD_LABELS: Record<string, string> = {
  name: "Nombre",
  contact: "Contacto",
  phone: "Teléfono",
  whatsapp_id: "WhatsApp ID",
  identification_type: "Tipo de documento",
  identification_number: "Número de documento",
};

function Index() {
  const supabase = createClient();
  const queryClient = useQueryClient();
  const { isAdmin, adminId } = useIsAdmin();

  const customersQueryKey = ["users", "customers"];
  const {
    data = [],
    isLoading,
    refetch,
  } = useQuery<CustomerRow[]>({
    queryKey: customersQueryKey,
    queryFn: async () => {
      const data = await listCustomers(supabase);
      return data as CustomerRow[];
    },
    staleTime: 300_000,
    retry: 1,
  });

  const changeRequestsQueryKey = ["users", "customers", "change-requests"];
  const changeRequestsQuery = useQuery<PendingChangeRequest[]>({
    queryKey: changeRequestsQueryKey,
    queryFn: async () => {
      const { data, error } = await supabase
        .from("customer_change_request")
        .select("id, customer_id, requested_data")
        .eq("status", "pending");
      if (error) throw error;
      return data as PendingChangeRequest[];
    },
  });

  const pendingRequestByCustomerId = new Map(
    (changeRequestsQuery.data ?? []).map((request) => [
      request.customer_id,
      request,
    ]),
  );

  const approveMutation = useMutation({
    mutationFn: async (request: PendingChangeRequest) => {
      if (!adminId) throw new Error("No se identificó el admin actual.");
      const { error: updateError } = await supabase
        .from("customer")
        .update(
          request.requested_data as Database["public"]["Tables"]["customer"]["Update"],
        )
        .eq("id", request.customer_id);
      if (updateError) throw new Error(updateError.message);
      const { error: reviewError } = await supabase
        .from("customer_change_request")
        .update({
          status: "approved",
          reviewed_by: adminId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", request.id);
      if (reviewError) throw new Error(reviewError.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: changeRequestsQueryKey });
      queryClient.invalidateQueries({ queryKey: customersQueryKey });
    },
  });

  const rejectMutation = useMutation({
    mutationFn: async (request: PendingChangeRequest) => {
      if (!adminId) throw new Error("No se identificó el admin actual.");
      const { error } = await supabase
        .from("customer_change_request")
        .update({
          status: "rejected",
          reviewed_by: adminId,
          reviewed_at: new Date().toISOString(),
        })
        .eq("id", request.id);
      if (error) throw new Error(error.message);
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: changeRequestsQueryKey });
    },
  });

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
    { title: "WhatsApp ID", dataIndex: "whatsapp_id", key: "whatsapp_id" },
    {
      title: "Acciones",
      key: "actions",
      render: (_: unknown, customer: CustomerRow) => {
        const pendingRequest = pendingRequestByCustomerId.get(customer.id);
        if (pendingRequest) {
          const changesDescription = Object.entries(
            pendingRequest.requested_data,
          )
            .map(([field, value]) => `${FIELD_LABELS[field] || field}: ${value}`)
            .join(", ");
          return (
            <Space orientation="vertical" size={4}>
              <Tooltip title={changesDescription}>
                <Tag color="gold">Cambio pendiente de aprobación</Tag>
              </Tooltip>
              {isAdmin && (
                <Space size={4}>
                  <Button
                    size="small"
                    type="primary"
                    loading={approveMutation.isPending}
                    onClick={() => approveMutation.mutate(pendingRequest)}
                  >
                    Aprobar
                  </Button>
                  <Button
                    size="small"
                    danger
                    loading={rejectMutation.isPending}
                    onClick={() => rejectMutation.mutate(pendingRequest)}
                  >
                    Rechazar
                  </Button>
                </Space>
              )}
            </Space>
          );
        }
        if (!isAdmin || !adminId) return null;
        return (
          <EditCustomerModal
            customer={customer}
            adminId={adminId}
            onSuccess={async () => {
              await queryClient.invalidateQueries({
                queryKey: changeRequestsQueryKey,
              });
            }}
          />
        );
      },
    },
  ];

  return (
    <div>
      {!isAdmin && (
        <Typography.Paragraph type="secondary">
          Solo un administrador puede editar clientes o aprobar cambios.
        </Typography.Paragraph>
      )}
      <Space style={{ marginBottom: 16 }}>
        <CreateCustomerModal
          onSuccess={async () => {
            await refetch();
          }}
        />
      </Space>
      <Table<CustomerRow>
        rowKey="id"
        columns={columns}
        dataSource={data}
        loading={isLoading || changeRequestsQuery.isLoading}
      />
    </div>
  );
}

export default Index;
