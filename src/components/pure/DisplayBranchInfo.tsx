import React from 'react';
import { Card, Divider, Typography, Image, Row, Col } from 'antd';
import { Branch, BranchBusiness, weekDay, WEEKDAY_LABEL } from '@/constants/models';
import { BRANCH_TYPE_LABELS } from '@/constants/labels';
import dynamic from 'next/dynamic';

const { Text, Title } = Typography;

const MapDisplay = dynamic(
  () => import("@/components/pure/MapDisplay"),
  { ssr: false }
);

interface DisplayBranchInfoProps {
  branch: Branch;
}

const DisplayBranchInfo: React.FC<DisplayBranchInfoProps> = ({ branch }) => {
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

  // Función para renderizar los horarios de operación
  const renderOperatingHours = () => {
    if (!branch.operatingHours || Object.keys(branch.operatingHours).length === 0) return null;

    return (
      <>
        <Title level={5} style={{ marginTop: '16px', marginBottom: '8px' }}>Horarios de atención</Title>
        {weekDay.map(day => {
          const hours = branch.operatingHours?.[day];
          if (!hours) return null;
          
          return (
            <div key={day} style={{ marginBottom: '8px' }}>
              <Text strong>{WEEKDAY_LABEL[day]}: </Text>
              <Text>{`${hours[0]} - ${hours[1]}`}</Text>
            </div>
          );
        })}
      </>
    );
  };

  // Función para renderizar los métodos de pago
  const renderPaymentMethods = () => {
    if (!branch.availablePaymentMethods || branch.availablePaymentMethods.length === 0) return null;

    return (
      <div style={{ marginBottom: '16px' }}>
        <Text strong>Métodos de pago disponibles: </Text>
        <Text>{branch.availablePaymentMethods.join(', ')}</Text>
      </div>
    );
  };

  // Función para renderizar opciones de recogida y envío
  const renderPickupDeliveryOptions = () => {
    const options = [];
    
    if (branch.isPickupAvailable) {
      options.push('Recogida en tienda disponible');
    }
    
    if (branch.isDeliveryAvailable) {
      options.push('Envío a domicilio disponible');
    }
    
    if (options.length === 0) return null;
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <Text strong>Opciones de entrega: </Text>
        <Text>{options.join(', ')}</Text>
      </div>
    );
  };

  // Función para renderizar el logo
  const renderLogo = () => {
    if (!branch.logo) return null;
    
    return (
      <div style={{ marginBottom: '16px', textAlign: 'center' }}>
        <Image 
          src={branch.logo} 
          alt={`Logo de ${branch.name}`}
          style={{ maxHeight: '120px', maxWidth: '100%' }}
          fallback="data:image/png;base64,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"
        />
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
      <Card style={{ borderRadius: '12px', overflow: 'hidden' }}>
        {/* LOGO */}
        {renderLogo()}
        
        {/* INFORMACIÓN GENERAL */}
        <div>
          <Divider>Información general</Divider>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
            {/* Columna izquierda */}
            <div style={{ flex: '1 1 300px', minWidth: '0' }}>
              {renderField('Nombre de la tienda', branch.name)}
              {renderField('Dirección completa', branch.address)}
              
              {!isEmpty(branch.location) && (
                <div style={{ marginBottom: '16px' }}>
                  <Text strong>Ubicación: </Text>
                  <div style={{ height: '200px', marginTop: '8px' }}>
                    <MapDisplay 
                      position={{
                        lat: branch.location.coordinates[1],
                        lng: branch.location.coordinates[0]
                      }}
                      readOnly
                    />
                  </div>
                </div>
              )}
            </div>

            {/* Columna derecha */}
            <div style={{ flex: '1 1 300px', minWidth: '0' }}>
              {renderField('Tipo de negocio', branch.businessType, 
                (value) => BRANCH_TYPE_LABELS[value as keyof typeof BRANCH_TYPE_LABELS] || value)}
              {renderField('Descripción', branch.description)}
            </div>
          </div>
        </div>

        {/* INFORMACIÓN OPERACIONAL */}
        <div>
          <Divider>Información operacional</Divider>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
            <div style={{ flex: '1 1 300px', minWidth: '0' }}>
              {renderPaymentMethods()}
              {renderPickupDeliveryOptions()}
            </div>
            <div style={{ flex: '1 1 300px', minWidth: '0' }}>
              {renderOperatingHours()}
            </div>
          </div>
        </div>

        {/* INFORMACIÓN DEL ENCARGADO */}
        {(!isEmpty(branch.managerName) || !isEmpty(branch.managerPhone)) && (
          <div>
            <Divider>Información del encargado</Divider>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
              <div style={{ flex: '1 1 300px', minWidth: '0' }}>
                {renderField('Nombre del encargado', branch.managerName)}
              </div>
              <div style={{ flex: '1 1 300px', minWidth: '0' }}>
                {renderField('Teléfono celular del encargado', branch.managerPhone)}
              </div>
            </div>
          </div>
        )}

        {/* GALERÍA DE IMÁGENES */}
        {!isEmpty(branch.images) && (
          <div>
            <Divider>Galería de imágenes</Divider>
            <Row gutter={[16, 16]}>
              {branch.images.map((image, index) => (
                <Col xs={24} sm={12} md={8} lg={6} key={`image-${index}`}>
                  <Image
                    src={image}
                    alt={`Imagen ${index + 1} de ${branch.name}`}
                    style={{ width: '100%', height: '150px', objectFit: 'cover' }}
                    fallback="data:image/png;base64,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"
                  />
                </Col>
              ))}
            </Row>
          </div>
        )}
      </Card>
    </div>
  );
};

export default DisplayBranchInfo;