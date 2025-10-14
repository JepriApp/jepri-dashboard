import React from 'react';
import { Card, Divider, Typography } from 'antd';
import { Vendor, VendorGenders, IdentificationOptions, EthnicityOptions } from '@/constants/models';
import { GENDER_LABELS } from '@/constants/labels';

const { Text, Title } = Typography;

interface DisplayVendorInfoProps {
  vendor: Vendor;
}

const DisplayVendorInfo: React.FC<DisplayVendorInfoProps> = ({ vendor }) => {
  // Función para verificar si un valor está vacío
  const isEmpty = (value: any): boolean => {
    if (value === undefined || value === null || value === "") return true;
    if (Array.isArray(value) && value.length === 0) return true;
    if (typeof value === "object" && value !== null && Object.keys(value).length === 0) return true;
    return false;
  };

  // Función para mostrar un campo solo si no está vacío
  const renderField = (label: string, value: any, formatter?: (val: any) => React.ReactNode) => {
    if (isEmpty(value)) return null;
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <Text strong>{label}: </Text>
        <Text>{formatter ? formatter(value) : value}</Text>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
      <Card style={{ borderRadius: '12px', overflow: 'hidden' }}>
        {/* INFORMACIÓN PERSONAL */}
        <div>
          <Divider>Información personal</Divider>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
            <div style={{ flex: '1 1 300px', minWidth: '0' }}>
              {renderField('Código interno', vendor.internalCode)}
              {renderField('Nombre completo', vendor.fullName)}
              {renderField('Tipo de identificación', vendor.typeOfIdentification)}
              {renderField('Número de identidad', vendor.identification)}
              {renderField('E-mail', vendor.email)}
              {renderField('Teléfono celular', vendor.cellphone)}
              {renderField('Dirección', vendor.address)}
            </div>
            
            <div style={{ flex: '1 1 300px', minWidth: '0' }}>
              {renderField('Edad', vendor.age)}
              {renderField('Género', vendor.gender, 
                (value) => GENDER_LABELS[value as keyof typeof GENDER_LABELS] || value)}
              {renderField('Biografía', vendor.bio)}
              {renderField('Pertenencia étnica', vendor.ethnicity)}
              {renderField('País', vendor.country)}
              {renderField('Ciudad', vendor.city)}
            </div>
          </div>
        </div>

        {/* INFORMACIÓN FINANCIERA */}
        {(!isEmpty(vendor.commercialRegistry) || !isEmpty(vendor.rut) || !isEmpty(vendor.bankAccount)) && (
          <div>
            <Divider>Información financiera</Divider>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
              <div style={{ flex: '1 1 300px', minWidth: '0' }}>
                {renderField('Registro comercial', vendor.commercialRegistry)}
                {renderField('RUT', vendor.rut)}
              </div>
              
              <div style={{ flex: '1 1 300px', minWidth: '0' }}>
                {!isEmpty(vendor.bankAccount) && (
                  <>
                    {renderField('Banco', vendor.bankAccount?.entity)}
                    {renderField('Número de cuenta', vendor.bankAccount?.number)}
                    {renderField('Tipo de cuenta', vendor.bankAccount?.type)}
                  </>
                )}
              </div>
            </div>
          </div>
        )}

        {/* INFORMACIÓN DE ESTADO */}
        <div>
          <Divider>Información de estado</Divider>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
            <div style={{ flex: '1 1 300px', minWidth: '0' }}>
              {renderField('Estado', vendor.state)}
              {renderField('Activo', vendor.isActive ? 'Sí' : 'No')}
              {renderField('Listo para vender', vendor.isReadyToSell ? 'Sí' : 'No')}
            </div>
            
            <div style={{ flex: '1 1 300px', minWidth: '0' }}>
              {renderField('Rango', vendor.rank)}
              {renderField('Ingresos', vendor.incomes)}
              {renderField('Habeas Data confirmado', vendor.isHabeasDataConfirm ? 'Sí' : 'No')}
              {renderField('Email verificado', vendor.isEmailVerified ? 'Sí' : 'No')}
            </div>
          </div>
        </div>
      </Card>
    </div>
  );
};

export default DisplayVendorInfo;