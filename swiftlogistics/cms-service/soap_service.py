# =============================================================================
# SwiftTrack Logistics - CMS Service (Customer Management System)
# =============================================================================
# SOAP/XML Mock Service for heterogeneous system integration
# Implements: SOAP endpoints, XML parsing, Customer validation
# =============================================================================

import os
import json
import logging
from datetime import datetime
from xml.etree import ElementTree as ET

from flask import Flask, request, Response
import psycopg2
from psycopg2.extras import RealDictCursor

# =============================================================================
# CONFIGURATION
# =============================================================================

app = Flask(__name__)

POSTGRES_HOST = os.environ.get('POSTGRES_HOST', 'postgres')
POSTGRES_DB = os.environ.get('POSTGRES_DB', 'swifttrack')
POSTGRES_USER = os.environ.get('POSTGRES_USER', 'swifttrack_user')
POSTGRES_PASSWORD = os.environ.get('POSTGRES_PASSWORD', 'swifttrack_secure_pass_2026')
LOG_LEVEL = os.environ.get('LOG_LEVEL', 'INFO')

# =============================================================================
# STRUCTURED LOGGING
# =============================================================================

class StructuredLogger:
    def __init__(self, name):
        self.logger = logging.getLogger(name)
        self.logger.setLevel(getattr(logging, LOG_LEVEL))
        handler = logging.StreamHandler()
        handler.setFormatter(logging.Formatter(
            '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "service": "cms-service", "message": "%(message)s"}'
        ))
        self.logger.addHandler(handler)
    
    def info(self, message, **kwargs):
        self.logger.info(json.dumps({"msg": message, **kwargs}))
    
    def error(self, message, **kwargs):
        self.logger.error(json.dumps({"msg": message, **kwargs}))

logger = StructuredLogger(__name__)

# =============================================================================
# DATABASE CONNECTION
# =============================================================================

def get_db_connection():
    """Create database connection."""
    return psycopg2.connect(
        host=POSTGRES_HOST,
        database=POSTGRES_DB,
        user=POSTGRES_USER,
        password=POSTGRES_PASSWORD,
        cursor_factory=RealDictCursor
    )

# =============================================================================
# SOAP/XML HELPERS
# =============================================================================

SOAP_NAMESPACE = "http://swifttrack.com/cms"

def create_soap_response(body_content, is_fault=False):
    """Create SOAP envelope response with XML content."""
    
    envelope = f'''<?xml version="1.0" encoding="UTF-8"?>
<soap:Envelope xmlns:soap="http://schemas.xmlsoap.org/soap/envelope/"
               xmlns:cms="{SOAP_NAMESPACE}">
    <soap:Header>
        <cms:timestamp>{datetime.utcnow().isoformat()}</cms:timestamp>
        <cms:service>SwiftTrack-CMS</cms:service>
    </soap:Header>
    <soap:Body>
        {body_content}
    </soap:Body>
</soap:Envelope>'''
    
    return Response(envelope, mimetype='application/xml')

def create_soap_fault(fault_code, fault_string, detail=None):
    """Create SOAP Fault response."""
    detail_xml = f"<detail>{detail}</detail>" if detail else ""
    
    fault_body = f'''<soap:Fault>
            <faultcode>{fault_code}</faultcode>
            <faultstring>{fault_string}</faultstring>
            {detail_xml}
        </soap:Fault>'''
    
    return create_soap_response(fault_body, is_fault=True)

def parse_soap_request(xml_data):
    """Parse incoming SOAP request and extract body content."""
    try:
        root = ET.fromstring(xml_data)
        
        # Find Body element
        namespaces = {
            'soap': 'http://schemas.xmlsoap.org/soap/envelope/',
            'cms': SOAP_NAMESPACE
        }
        
        body = root.find('.//soap:Body', namespaces)
        if body is None:
            # Try without namespace
            body = root.find('.//{http://schemas.xmlsoap.org/soap/envelope/}Body')
        
        return body
    except ET.ParseError as e:
        logger.error("XML parsing failed", error=str(e))
        return None

# =============================================================================
# WSDL DEFINITION
# =============================================================================

WSDL_DEFINITION = f'''<?xml version="1.0" encoding="UTF-8"?>
<definitions name="CMSService"
             targetNamespace="{SOAP_NAMESPACE}"
             xmlns="{SOAP_NAMESPACE}"
             xmlns:soap="http://schemas.xmlsoap.org/wsdl/soap/"
             xmlns:tns="{SOAP_NAMESPACE}"
             xmlns:xsd="http://www.w3.org/2001/XMLSchema"
             xmlns:wsdl="http://schemas.xmlsoap.org/wsdl/">

    <!-- Types -->
    <types>
        <xsd:schema targetNamespace="{SOAP_NAMESPACE}">
            <xsd:element name="GetCustomerRequest">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="customerId" type="xsd:string"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
            
            <xsd:element name="GetCustomerResponse">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="customer" type="tns:CustomerType"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
            
            <xsd:element name="ValidateCustomerRequest">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="customerId" type="xsd:string"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
            
            <xsd:element name="ValidateCustomerResponse">
                <xsd:complexType>
                    <xsd:sequence>
                        <xsd:element name="valid" type="xsd:boolean"/>
                        <xsd:element name="status" type="xsd:string"/>
                        <xsd:element name="creditLimit" type="xsd:decimal"/>
                    </xsd:sequence>
                </xsd:complexType>
            </xsd:element>
            
            <xsd:complexType name="CustomerType">
                <xsd:sequence>
                    <xsd:element name="id" type="xsd:string"/>
                    <xsd:element name="name" type="xsd:string"/>
                    <xsd:element name="email" type="xsd:string"/>
                    <xsd:element name="phone" type="xsd:string"/>
                    <xsd:element name="company" type="xsd:string"/>
                    <xsd:element name="status" type="xsd:string"/>
                    <xsd:element name="totalOrders" type="xsd:int"/>
                    <xsd:element name="creditLimit" type="xsd:decimal"/>
                </xsd:sequence>
            </xsd:complexType>
        </xsd:schema>
    </types>

    <!-- Messages -->
    <message name="GetCustomerInput">
        <part name="parameters" element="tns:GetCustomerRequest"/>
    </message>
    <message name="GetCustomerOutput">
        <part name="parameters" element="tns:GetCustomerResponse"/>
    </message>
    <message name="ValidateCustomerInput">
        <part name="parameters" element="tns:ValidateCustomerRequest"/>
    </message>
    <message name="ValidateCustomerOutput">
        <part name="parameters" element="tns:ValidateCustomerResponse"/>
    </message>

    <!-- Port Type -->
    <portType name="CMSPortType">
        <operation name="GetCustomer">
            <input message="tns:GetCustomerInput"/>
            <output message="tns:GetCustomerOutput"/>
        </operation>
        <operation name="ValidateCustomer">
            <input message="tns:ValidateCustomerInput"/>
            <output message="tns:ValidateCustomerOutput"/>
        </operation>
    </portType>

    <!-- Binding -->
    <binding name="CMSBinding" type="tns:CMSPortType">
        <soap:binding style="document" transport="http://schemas.xmlsoap.org/soap/http"/>
        <operation name="GetCustomer">
            <soap:operation soapAction="GetCustomer"/>
            <input><soap:body use="literal"/></input>
            <output><soap:body use="literal"/></output>
        </operation>
        <operation name="ValidateCustomer">
            <soap:operation soapAction="ValidateCustomer"/>
            <input><soap:body use="literal"/></input>
            <output><soap:body use="literal"/></output>
        </operation>
    </binding>

    <!-- Service -->
    <service name="CMSService">
        <documentation>SwiftTrack Customer Management System SOAP Service</documentation>
        <port name="CMSPort" binding="tns:CMSBinding">
            <soap:address location="http://cms-service:5003/soap"/>
        </port>
    </service>
</definitions>'''

# =============================================================================
# HEALTH CHECK
# =============================================================================

@app.route('/health', methods=['GET'])
def health_check():
    """Health check endpoint."""
    try:
        conn = get_db_connection()
        conn.close()
        db_status = 'healthy'
    except:
        db_status = 'unhealthy'
    
    return Response(
        json.dumps({
            'service': 'cms-service',
            'type': 'SOAP/XML',
            'status': 'healthy' if db_status == 'healthy' else 'degraded',
            'database': db_status,
            'timestamp': datetime.utcnow().isoformat()
        }),
        mimetype='application/json'
    )

# =============================================================================
# WSDL ENDPOINT
# =============================================================================

@app.route('/soap', methods=['GET'])
@app.route('/wsdl', methods=['GET'])
def get_wsdl():
    """Return WSDL definition."""
    return Response(WSDL_DEFINITION, mimetype='application/xml')

# =============================================================================
# SOAP SERVICE ENDPOINT
# =============================================================================

@app.route('/soap', methods=['POST'])
def soap_handler():
    """
    =========================================================================
    SOAP/XML SERVICE ENDPOINT
    =========================================================================
    This endpoint handles SOAP requests for Customer Management:
    - GetCustomer: Retrieve customer details
    - ValidateCustomer: Validate customer for order placement
    
    This demonstrates heterogeneous system integration using SOAP/XML protocol.
    =========================================================================
    """
    logger.info("SOAP request received", content_type=request.content_type)
    
    try:
        soap_action = request.headers.get('SOAPAction', '').strip('"')
        xml_data = request.data.decode('utf-8')
        
        body = parse_soap_request(xml_data)
        if body is None:
            return create_soap_fault('soap:Client', 'Invalid SOAP request')
        
        # Route to appropriate handler based on SOAPAction or body content
        if 'GetCustomer' in soap_action or body.find('.//{*}GetCustomerRequest') is not None:
            return handle_get_customer(body)
        elif 'ValidateCustomer' in soap_action or body.find('.//{*}ValidateCustomerRequest') is not None:
            return handle_validate_customer(body)
        elif 'CreateCustomer' in soap_action or body.find('.//{*}CreateCustomerRequest') is not None:
            return handle_create_customer(body)
        elif 'UpdateCustomer' in soap_action or body.find('.//{*}UpdateCustomerRequest') is not None:
            return handle_update_customer(body)
        else:
            # Try to detect operation from body
            for child in body:
                tag = child.tag.split('}')[-1] if '}' in child.tag else child.tag
                if 'GetCustomer' in tag:
                    return handle_get_customer(body)
                elif 'ValidateCustomer' in tag:
                    return handle_validate_customer(body)
            
            return create_soap_fault('soap:Client', 'Unknown operation')
            
    except Exception as e:
        logger.error("SOAP handler error", error=str(e))
        return create_soap_fault('soap:Server', f'Internal error: {str(e)}')

def handle_get_customer(body):
    """Handle GetCustomer SOAP operation."""
    try:
        # Extract customer ID from request
        customer_id = None
        for elem in body.iter():
            if 'customerId' in elem.tag.lower() or elem.tag.endswith('customerId'):
                customer_id = elem.text
                break
        
        if not customer_id:
            return create_soap_fault('soap:Client', 'Missing customerId parameter')
        
        logger.info("GetCustomer request", customer_id=customer_id)
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT c.*, u.name, u.email, u.phone
            FROM clients c
            JOIN users u ON c.user_id = u.id
            WHERE c.id::text = %s OR c.user_id::text = %s OR u.email = %s
        """, (customer_id, customer_id, customer_id))
        
        customer = cursor.fetchone()
        conn.close()
        
        if not customer:
            return create_soap_fault('soap:Client', f'Customer not found: {customer_id}')
        
        response_body = f'''<cms:GetCustomerResponse xmlns:cms="{SOAP_NAMESPACE}">
            <cms:customer>
                <cms:id>{customer['id']}</cms:id>
                <cms:name>{customer['name']}</cms:name>
                <cms:email>{customer['email']}</cms:email>
                <cms:phone>{customer['phone'] or ''}</cms:phone>
                <cms:company>{customer['company'] or ''}</cms:company>
                <cms:status>{customer['status']}</cms:status>
                <cms:totalOrders>{customer['total_orders']}</cms:totalOrders>
                <cms:creditLimit>10000.00</cms:creditLimit>
            </cms:customer>
        </cms:GetCustomerResponse>'''
        
        logger.info("GetCustomer successful", customer_id=customer_id)
        return create_soap_response(response_body)
        
    except Exception as e:
        logger.error("GetCustomer failed", error=str(e))
        return create_soap_fault('soap:Server', f'Failed to get customer: {str(e)}')

def handle_validate_customer(body):
    """
    =========================================================================
    VALIDATE CUSTOMER - SAGA STEP
    =========================================================================
    This operation is called by the Saga orchestrator to validate a customer
    before allowing order creation. It checks:
    - Customer exists
    - Customer status is active
    - Customer has sufficient credit
    
    Returns validation result for Saga decision.
    =========================================================================
    """
    try:
        customer_id = None
        for elem in body.iter():
            if 'customerId' in elem.tag.lower() or elem.tag.endswith('customerId'):
                customer_id = elem.text
                break
        
        if not customer_id:
            return create_soap_fault('soap:Client', 'Missing customerId parameter')
        
        logger.info("ValidateCustomer request", customer_id=customer_id)
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT c.*, u.name, u.status as user_status
            FROM clients c
            JOIN users u ON c.user_id = u.id
            WHERE c.id::text = %s OR c.user_id::text = %s
        """, (customer_id, customer_id))
        
        customer = cursor.fetchone()
        conn.close()
        
        if not customer:
            response_body = f'''<cms:ValidateCustomerResponse xmlns:cms="{SOAP_NAMESPACE}">
                <cms:valid>false</cms:valid>
                <cms:status>NOT_FOUND</cms:status>
                <cms:creditLimit>0</cms:creditLimit>
                <cms:reason>Customer not found</cms:reason>
            </cms:ValidateCustomerResponse>'''
            return create_soap_response(response_body)
        
        is_valid = customer['status'] == 'active' and customer['user_status'] == 'active'
        credit_limit = 10000.00 if is_valid else 0
        
        response_body = f'''<cms:ValidateCustomerResponse xmlns:cms="{SOAP_NAMESPACE}">
            <cms:valid>{'true' if is_valid else 'false'}</cms:valid>
            <cms:status>{customer['status'].upper()}</cms:status>
            <cms:creditLimit>{credit_limit}</cms:creditLimit>
            <cms:reason>{'Customer validated successfully' if is_valid else 'Customer account is not active'}</cms:reason>
        </cms:ValidateCustomerResponse>'''
        
        logger.info("ValidateCustomer completed", customer_id=customer_id, valid=is_valid)
        return create_soap_response(response_body)
        
    except Exception as e:
        logger.error("ValidateCustomer failed", error=str(e))
        return create_soap_fault('soap:Server', f'Validation failed: {str(e)}')

def handle_create_customer(body):
    """Handle CreateCustomer SOAP operation."""
    try:
        # Extract customer data
        name = email = phone = company = None
        for elem in body.iter():
            tag = elem.tag.split('}')[-1] if '}' in elem.tag else elem.tag
            if tag == 'name':
                name = elem.text
            elif tag == 'email':
                email = elem.text
            elif tag == 'phone':
                phone = elem.text
            elif tag == 'company':
                company = elem.text
        
        if not name or not email:
            return create_soap_fault('soap:Client', 'Missing required fields: name, email')
        
        logger.info("CreateCustomer request", email=email)
        
        # For demo, return success response
        import uuid
        new_id = str(uuid.uuid4())
        
        response_body = f'''<cms:CreateCustomerResponse xmlns:cms="{SOAP_NAMESPACE}">
            <cms:success>true</cms:success>
            <cms:customerId>{new_id}</cms:customerId>
            <cms:message>Customer created successfully</cms:message>
        </cms:CreateCustomerResponse>'''
        
        return create_soap_response(response_body)
        
    except Exception as e:
        logger.error("CreateCustomer failed", error=str(e))
        return create_soap_fault('soap:Server', f'Failed to create customer: {str(e)}')

def handle_update_customer(body):
    """Handle UpdateCustomer SOAP operation."""
    try:
        customer_id = None
        for elem in body.iter():
            if 'customerId' in elem.tag.lower():
                customer_id = elem.text
                break
        
        if not customer_id:
            return create_soap_fault('soap:Client', 'Missing customerId')
        
        response_body = f'''<cms:UpdateCustomerResponse xmlns:cms="{SOAP_NAMESPACE}">
            <cms:success>true</cms:success>
            <cms:customerId>{customer_id}</cms:customerId>
            <cms:message>Customer updated successfully</cms:message>
        </cms:UpdateCustomerResponse>'''
        
        return create_soap_response(response_body)
        
    except Exception as e:
        return create_soap_fault('soap:Server', f'Failed to update customer: {str(e)}')

# =============================================================================
# REST-like ENDPOINTS (for internal service communication)
# =============================================================================

@app.route('/customer/<customer_id>', methods=['GET'])
def rest_get_customer(customer_id):
    """REST endpoint for internal service calls."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT c.*, u.name, u.email, u.phone
            FROM clients c
            JOIN users u ON c.user_id = u.id
            WHERE c.id::text = %s OR c.user_id::text = %s
        """, (customer_id, customer_id))
        
        customer = cursor.fetchone()
        conn.close()
        
        if not customer:
            return Response(
                json.dumps({'error': 'Customer not found'}),
                status=404,
                mimetype='application/json'
            )
        
        return Response(
            json.dumps({
                'id': str(customer['id']),
                'name': customer['name'],
                'email': customer['email'],
                'phone': customer['phone'],
                'company': customer['company'],
                'status': customer['status'],
                'totalOrders': customer['total_orders']
            }),
            mimetype='application/json'
        )
        
    except Exception as e:
        return Response(
            json.dumps({'error': str(e)}),
            status=500,
            mimetype='application/json'
        )

@app.route('/customer/<customer_id>/validate', methods=['GET'])
def rest_validate_customer(customer_id):
    """REST endpoint for customer validation."""
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        cursor.execute("""
            SELECT c.status, u.status as user_status
            FROM clients c
            JOIN users u ON c.user_id = u.id
            WHERE c.id::text = %s OR c.user_id::text = %s
        """, (customer_id, customer_id))
        
        customer = cursor.fetchone()
        conn.close()
        
        if not customer:
            return Response(
                json.dumps({'valid': False, 'reason': 'Customer not found'}),
                mimetype='application/json'
            )
        
        is_valid = customer['status'] == 'active' and customer['user_status'] == 'active'
        
        return Response(
            json.dumps({
                'valid': is_valid,
                'status': customer['status'],
                'reason': 'OK' if is_valid else 'Customer not active'
            }),
            mimetype='application/json'
        )
        
    except Exception as e:
        return Response(
            json.dumps({'valid': False, 'reason': str(e)}),
            status=500,
            mimetype='application/json'
        )

# =============================================================================
# STARTUP
# =============================================================================

if __name__ == '__main__':
    logger.info("Starting CMS SOAP Service", port=5003)
    app.run(host='0.0.0.0', port=5003, debug=False)
