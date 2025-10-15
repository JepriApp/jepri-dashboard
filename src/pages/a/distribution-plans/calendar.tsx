import DashboardLayout from "@/components/layout/DashboardLayout";
import React, { ReactElement, useMemo, useState } from "react";
import {
  Calendar,
  Badge,
  Button,
  Space,
  Typography,
  Card,
  Tag,
  CalendarProps,
  App,
} from "antd";
import { CheckOutlined, LeftOutlined, RightOutlined } from "@ant-design/icons";
import type { Dayjs } from "dayjs";
import dayjs from "dayjs";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/services/supabase.client";

type DistributionPlanMinimal = {
  id: string;
  plan_date: string; // YYYY-MM-DD
  plan_code: string;
};

const { Title, Text } = Typography;

// Configuración: evitar duplicados siempre activo (se puede reintroducir selector luego)
const AVOID_DUPLICATES = true;

const CalendarCreateMultiplePlansPage = () => {
  const { message } = App.useApp();
  const [selectedDates, setSelectedDates] = useState<Set<string>>(new Set());
  // Evitar duplicados está fijado por configuración

  // Cargar todas las fechas de planes existentes (simple y suficiente para MVP)
  const {
    data: existingPlans = [],
    isLoading: loadingPlans,
    refetch,
  } = useQuery<DistributionPlanMinimal[]>({
    queryKey: ["distributionPlans-all"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("distribution_plan")
        .select("id, plan_date, plan_code")
        .order("plan_date", { ascending: true });
      if (error) throw error;
      return data as DistributionPlanMinimal[];
    },
    staleTime: 30_000,
  });

  const existingByDate = useMemo(() => {
    return new Map(existingPlans.map((p) => [p.plan_date, p.plan_code]));
  }, [existingPlans]);

  const handleSelect = (date: Dayjs) => {
    const today = dayjs().startOf("day");
    if (!date.isAfter(today)) return;
    const iso = date.format("YYYY-MM-DD");
    if (AVOID_DUPLICATES && existingByDate.has(iso)) {
      message.warning("No se permiten duplicados: ya existe un plan para esa fecha");
      return;
    }
    setSelectedDates((prev) => {
      const next = new Set(prev);
      if (next.has(iso)) next.delete(iso);
      else next.add(iso);
      return next;
    });
  };

  const removeSelected = (iso: string) => {
    setSelectedDates((prev) => {
      const next = new Set(prev);
      next.delete(iso);
      return next;
    });
  };

  const selectedCount = selectedDates.size;
  const existingCount = useMemo(() => {
    let count = 0;
    selectedDates.forEach((d) => {
      if (existingByDate.has(d)) count++;
    });
    return count;
  }, [selectedDates, existingByDate]);
  const newToCreateCount = AVOID_DUPLICATES
    ? selectedCount - existingCount
    : selectedCount;

  const toCreateDates = useMemo(() => {
    const today = dayjs().startOf("day");
    const dates = Array.from(selectedDates).filter((d) =>
      dayjs(d).isAfter(today)
    );
    return AVOID_DUPLICATES
      ? dates.filter((d) => !existingByDate.has(d))
      : dates;
  }, [selectedDates, existingByDate]);

  const handleCreate = async () => {
    if (toCreateDates.length === 0) {
      message.warning(
        selectedCount === 0
          ? "Selecciona al menos una fecha"
          : "Todas las fechas seleccionadas ya tienen plan (evitar duplicados activo)"
      );
      return;
    }

    try {
      const payload = toCreateDates.map((d) => ({ plan_date: d }));
      const { data, error } = await supabase
        .from("distribution_plan")
        .insert(payload)
        .select();
      if (error) throw error;

      message.success(
        `Se crearon ${payload.length} plan(es). ${existingCount} omitido(s) por existir.`
      );
      setSelectedDates(new Set());
      await refetch();
    } catch (err: any) {
      console.error(err);
      message.error(
        err?.message || "Error al crear planes. Intenta nuevamente más tarde."
      );
    }
  };

  const dateCellRender = (value: Dayjs) => {
    const iso = value.format("YYYY-MM-DD");
    const isSelected = selectedDates.has(iso);
    const exists = existingByDate.has(iso);
    const code = existingByDate.get(iso);
    return (
      <>
        {exists && <Tag color="blue">{`Plan${code ? ` ${code}` : ""}`}</Tag>}
        {isSelected && <Tag color="gold" icon={<CheckOutlined />}></Tag>}
      </>
    );
  };

  const cellRender: CalendarProps<Dayjs>["cellRender"] = (current, info) => {
    if (info.type === "date") return dateCellRender(current);
    return info.originNode;
  };
  return (
    <Space
      align="start"
      style={{ width: "100%" }}
      size="large"
      direction={"vertical"}
    >
      <Card
        style={{ width: 380 }}
        title="Resumen y acciones"
        actions={[
          <Button onClick={() => setSelectedDates(new Set())}>
            Limpiar selección
          </Button>,
          <Button type="primary" disabled={loadingPlans} onClick={handleCreate}>
            Crear {newToCreateCount} plan
            {newToCreateCount === 1 ? "" : "es"}
          </Button>,
        ]}
      >
        <Text>
          Nuevas a crear: <b>{newToCreateCount}</b>
        </Text>
        <div>
          <Text strong>Fechas seleccionadas</Text>
          <div
            style={{
              marginTop: 8,
              display: "flex",
              flexWrap: "wrap",
              gap: 8,
            }}
          >
            {Array.from(selectedDates)
              .sort()
              .map((iso) => (
                <Tag
                  key={iso}
                  closable
                  onClose={() => removeSelected(iso)}
                  color={existingByDate.has(iso) ? "geekblue" : "blue"}
                >
                  {iso}
                  {existingByDate.has(iso) && existingByDate.get(iso)
                    ? ` (${existingByDate.get(iso) as string})`
                    : ""}
                </Tag>
              ))}
          </div>
        </div>
      </Card>
      <Card style={{ flex: 1 }} title="Calendario">
        <Calendar
          fullscreen
          cellRender={cellRender}
          headerRender={({ value, onChange }) => {
            const current = value.clone();
            const prevMonth = () =>
              onChange(value.clone().subtract(1, "month"));
            const nextMonth = () => onChange(value.clone().add(1, "month"));
            return (
              <Space style={{ width: "100%", justifyContent: "space-between" }}>
                <Button
                  type="text"
                  icon={<LeftOutlined />}
                  onClick={prevMonth}
                />
                <Text strong>{current.format("MMMM YYYY")}</Text>
                <Button
                  type="text"
                  icon={<RightOutlined />}
                  onClick={nextMonth}
                />
              </Space>
            );
          }}
          disabledDate={(d) => !d.isAfter(dayjs().startOf("day"))}
          onSelect={(value, info) => {
            if (info && (info as any).source !== "date") return;
            handleSelect(value);
          }}
        />
      </Card>
    </Space>
  );
};

export default CalendarCreateMultiplePlansPage;

CalendarCreateMultiplePlansPage.getLayout = function getLayout(
  page: ReactElement
) {
  return <DashboardLayout backButton>{page}</DashboardLayout>;
};
