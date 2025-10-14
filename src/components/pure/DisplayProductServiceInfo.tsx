import React from 'react';
import { Card, Divider, Typography, Tag, Image, Row, Col } from 'antd';
import { ProductService, weekDay, WEEKDAY_LABEL } from '@/constants/models';

const { Text, Title } = Typography;

interface DisplayProductServiceInfoProps {
  productService: ProductService;
}

const DisplayProductServiceInfo: React.FC<DisplayProductServiceInfoProps> = ({ productService }) => {
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
  const renderAvailableHours = () => {
    if (!productService.serviceScheduling?.availableHours || 
        Object.keys(productService.serviceScheduling.availableHours).length === 0) return null;

    return (
      <>
        <Title level={5} style={{ marginTop: '16px', marginBottom: '8px' }}>Horarios disponibles</Title>
        {weekDay.map(day => {
          const hours = productService.serviceScheduling?.availableHours?.[day];
          if (!hours || !hours.isOpen) return null;
          
          return (
            <div key={day} style={{ marginBottom: '8px' }}>
              <Text strong>{WEEKDAY_LABEL[day]}: </Text>
              <Text>{`${hours.open} - ${hours.close}`}</Text>
            </div>
          );
        })}
      </>
    );
  };

  // Función para renderizar el estado del producto/servicio
  const renderState = () => {
    if (isEmpty(productService.state)) return null;
    
    let color = 'green';
    if (productService.state === 'unavailable') color = 'orange';
    if (productService.state === 'out_of_stock') color = 'red';
    
    return (
      <div style={{ marginBottom: '16px' }}>
        <Text strong>Estado: </Text>
        <Tag color={color}>
          {productService.state === 'available' ? 'Disponible' : 
           productService.state === 'unavailable' ? 'No disponible' : 
           'Sin existencias'}
        </Tag>
      </div>
    );
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '40px' }}>
      <Card style={{ borderRadius: '12px', overflow: 'hidden' }}>
        {/* INFORMACIÓN GENERAL */}
        <div>
          <Divider>Información general</Divider>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
            <div style={{ flex: '1 1 300px', minWidth: '0' }}>
              {renderField('Nombre', productService.name)}
              {renderField('Categoría', productService.categoryId)}
              {renderField('Tipo', productService.type === 'product' ? 'Producto' : 'Servicio')}
              {renderState()}
            </div>
            
            <div style={{ flex: '1 1 300px', minWidth: '0' }}>
              {renderField('Descripción', productService.description)}
              {renderField('Descripción corta', productService.shortDescription)}
            </div>
          </div>
        </div>

        {/* INFORMACIÓN DE PRECIO E INVENTARIO */}
        <div>
          <Divider>Precio e inventario</Divider>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
            <div style={{ flex: '1 1 300px', minWidth: '0' }}>
              {renderField('Precio', productService.price, 
                (value) => `${value} ${productService.currency || ''}`)}
              {renderField('Moneda', productService.currency)}
            </div>
            
            <div style={{ flex: '1 1 300px', minWidth: '0' }}>
              {renderField('Inventario disponible', productService.inventory)}
            </div>
          </div>
        </div>

        {/* INFORMACIÓN DE SERVICIO (solo si es un servicio) */}
        {productService.type === 'service' && !isEmpty(productService.serviceScheduling) && (
          <div>
            <Divider>Información del servicio</Divider>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '20px' }}>
              <div style={{ flex: '1 1 300px', minWidth: '0' }}>
                {renderField('Requiere profesional', 
                  productService.serviceScheduling?.professionalRequired ? 'Sí' : 'No')}
                {renderField('Límite de atención por turno', 
                  productService.serviceScheduling?.attentionLimitPerSlot)}
              </div>
              
              <div style={{ flex: '1 1 300px', minWidth: '0' }}>
                {renderAvailableHours()}
              </div>
            </div>
          </div>
        )}

        {/* INFORMACIÓN DE IMÁGENES */}
        {(!isEmpty(productService.mainImage) || !isEmpty(productService.images)) && (
          <div>
            <Divider>Imágenes</Divider>
            
            {/* Imagen principal */}
            {!isEmpty(productService.mainImage) && (
              <div style={{ marginBottom: '24px' }}>
                <Title level={5} style={{ marginBottom: '16px' }}>Imagen principal</Title>
                <div style={{ textAlign: 'center' }}>
                  <Image 
                    src={productService.mainImage} 
                    alt={`Imagen principal de ${productService.name}`}
                    style={{ maxHeight: '300px', maxWidth: '100%' }}
                    fallback="data:image/png;base64,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"
                  />
                </div>
              </div>
            )}
            
            {/* Imágenes adicionales */}
            {!isEmpty(productService.images) && (
              <div>
                <Title level={5} style={{ marginBottom: '16px' }}>Imágenes adicionales</Title>
                <Row gutter={[16, 16]}>
                  {productService.images.map((image, index) => (
                    <Col xs={24} sm={12} md={8} lg={6} key={`image-${index}`}>
                      <Image
                        src={image}
                        alt={`Imagen ${index + 1} de ${productService.name}`}
                        style={{ width: '100%', height: '150px', objectFit: 'cover' }}
                        fallback="data:image/png;base64,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"
                      />
                    </Col>
                  ))}
                </Row>
              </div>
            )}
          </div>
        )}
      </Card>
    </div>
  );
};

export default DisplayProductServiceInfo;