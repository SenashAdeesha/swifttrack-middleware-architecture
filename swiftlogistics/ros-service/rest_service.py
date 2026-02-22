# =============================================================================
# SwiftTrack Logistics - ROS Service (Route Optimization System)
# =============================================================================
# REST/JSON Mock Service for heterogeneous system integration
# Implements: Route optimization, Distance calculation, ETA estimation
# =============================================================================

import os
import json
import logging
import math
from datetime import datetime, timedelta
import uuid

from flask import Flask, request, jsonify
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
            '{"timestamp": "%(asctime)s", "level": "%(levelname)s", "service": "ros-service", "message": "%(message)s"}'
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
# ROUTE OPTIMIZATION ALGORITHM (Mock Implementation)
# =============================================================================

def haversine_distance(lat1, lon1, lat2, lon2):
    """Calculate distance between two coordinates using Haversine formula."""
    R = 6371  # Earth's radius in km
    
    lat1_rad = math.radians(lat1)
    lat2_rad = math.radians(lat2)
    delta_lat = math.radians(lat2 - lat1)
    delta_lon = math.radians(lon2 - lon1)
    
    a = math.sin(delta_lat/2)**2 + math.cos(lat1_rad) * math.cos(lat2_rad) * math.sin(delta_lon/2)**2
    c = 2 * math.atan2(math.sqrt(a), math.sqrt(1-a))
    
    return R * c

def optimize_route(stops):
    """
    =========================================================================
    ROUTE OPTIMIZATION - NEAREST NEIGHBOR ALGORITHM
    =========================================================================
    Simple optimization using nearest neighbor heuristic.
    In production, this would use more sophisticated algorithms like:
    - Genetic algorithms
    - Simulated annealing  
    - Google OR-Tools
    =========================================================================
    """
    if not stops or len(stops) <= 1:
        return stops
    
    # Start from first stop (depot)
    optimized = [stops[0]]
    remaining = stops[1:]
    
    while remaining:
        current = optimized[-1]
        current_lat = current.get('lat', 40.7128)
        current_lon = current.get('lon', -74.0060)
        
        # Find nearest unvisited stop
        nearest_idx = 0
        nearest_dist = float('inf')
        
        for i, stop in enumerate(remaining):
            stop_lat = stop.get('lat', 40.7128 + i * 0.01)
            stop_lon = stop.get('lon', -74.0060 + i * 0.01)
            
            dist = haversine_distance(current_lat, current_lon, stop_lat, stop_lon)
            if dist < nearest_dist:
                nearest_dist = dist
                nearest_idx = i
        
        optimized.append(remaining.pop(nearest_idx))
    
    return optimized

def calculate_route_metrics(stops):
    """Calculate total distance and estimated time for route."""
    total_distance = 0
    total_time = 0  # in minutes
    
    for i in range(len(stops) - 1):
        lat1 = stops[i].get('lat', 40.7128)
        lon1 = stops[i].get('lon', -74.0060)
        lat2 = stops[i+1].get('lat', 40.7128)
        lon2 = stops[i+1].get('lon', -74.0060)
        
        dist = haversine_distance(lat1, lon1, lat2, lon2)
        total_distance += dist
        
        # Estimate time: average 30 km/h in city + 5 min per stop
        total_time += (dist / 30) * 60 + 5
    
    return {
        'total_distance_km': round(total_distance, 2),
        'estimated_duration_minutes': round(total_time),
        'stops_count': len(stops)
    }

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
    
    return jsonify({
        'service': 'ros-service',
        'type': 'REST/JSON',
        'status': 'healthy' if db_status == 'healthy' else 'degraded',
        'database': db_status,
        'timestamp': datetime.utcnow().isoformat()
    })

# =============================================================================
# REST API ENDPOINTS
# =============================================================================

@app.route('/route/<driver_id>', methods=['GET'])
def get_driver_route(driver_id):
    """
    =========================================================================
    GET DRIVER ROUTE
    =========================================================================
    Returns optimized route for a driver with:
    - Ordered stops
    - Estimated arrival times
    - Distance calculations
    
    This is called by the Middleware service to get route data.
    =========================================================================
    """
    logger.info("Route request received", driver_id=driver_id)
    
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Get driver's assigned orders
        cursor.execute("""
            SELECT o.*, u.name as customer_name, c.address as customer_address
            FROM orders o
            LEFT JOIN clients cl ON o.client_id = cl.id
            LEFT JOIN users u ON cl.user_id = u.id
            LEFT JOIN clients c ON o.client_id = c.id
            WHERE o.driver_id = (
                SELECT id FROM drivers 
                WHERE user_id::text = %s OR id::text = %s
            )
            AND o.status IN ('in_warehouse', 'out_for_delivery', 'pending')
            ORDER BY 
                CASE o.priority 
                    WHEN 'same_day' THEN 1 
                    WHEN 'express' THEN 2 
                    ELSE 3 
                END,
                o.created_at ASC
        """, (driver_id, driver_id))
        
        orders = cursor.fetchall()
        conn.close()
        
        if not orders:
            # Return sample route data for demo
            route_data = [
                {
                    'sequence': 1,
                    'orderId': 'ORD-004',
                    'address': '200 Sunset Dr, Staten Island, NY 10301',
                    'customerName': 'John Doe',
                    'packageType': 'fragile',
                    'priority': 'same_day',
                    'estimatedTime': '10:30 AM',
                    'status': 'pending',
                    'notes': 'Handle with care - Fragile items',
                    'lat': 40.5795,
                    'lon': -74.1502
                },
                {
                    'sequence': 2,
                    'orderId': 'ORD-001',
                    'address': '456 Residential St, Brooklyn, NY 11201',
                    'customerName': 'John Doe',
                    'packageType': 'small_box',
                    'priority': 'express',
                    'estimatedTime': '11:45 AM',
                    'status': 'pending',
                    'notes': '',
                    'lat': 40.6892,
                    'lon': -73.9857
                },
                {
                    'sequence': 3,
                    'orderId': 'ORD-006',
                    'address': '888 Park Avenue, Manhattan, NY 10021',
                    'customerName': 'Emily Rose',
                    'packageType': 'medium_box',
                    'priority': 'normal',
                    'estimatedTime': '1:15 PM',
                    'status': 'pending',
                    'notes': 'Leave at reception',
                    'lat': 40.7736,
                    'lon': -73.9566
                },
                {
                    'sequence': 4,
                    'orderId': 'ORD-007',
                    'address': '555 Broadway, Manhattan, NY 10012',
                    'customerName': 'Robert Smith',
                    'packageType': 'document',
                    'priority': 'express',
                    'estimatedTime': '2:30 PM',
                    'status': 'pending',
                    'notes': 'Signature required',
                    'lat': 40.7233,
                    'lon': -73.9983
                }
            ]
            
            return jsonify({'data': route_data})
        
        # Build stops list
        stops = []
        for order in orders:
            stops.append({
                'orderId': order['id'],
                'address': order['delivery_address'],
                'customerName': order['customer_name'] or 'Unknown',
                'packageType': order['package_type'],
                'priority': order['priority'],
                'notes': order['special_instructions'] or '',
                'status': 'pending',
                'lat': 40.7128 + len(stops) * 0.01,  # Mock coordinates
                'lon': -74.0060 + len(stops) * 0.01
            })
        
        # Optimize route
        optimized_stops = optimize_route(stops)
        
        # Add sequence numbers and estimated times
        base_time = datetime.now().replace(hour=9, minute=0)
        route_data = []
        
        for idx, stop in enumerate(optimized_stops, 1):
            eta = base_time + timedelta(minutes=30 * idx)
            route_data.append({
                'sequence': idx,
                'orderId': stop['orderId'],
                'address': stop['address'],
                'customerName': stop['customerName'],
                'packageType': stop['packageType'],
                'priority': stop['priority'],
                'estimatedTime': eta.strftime('%I:%M %p'),
                'status': stop['status'],
                'notes': stop['notes'],
                'lat': stop['lat'],
                'lon': stop['lon']
            })
        
        logger.info("Route generated", driver_id=driver_id, stops_count=len(route_data))
        
        return jsonify({'data': route_data})
        
    except Exception as e:
        logger.error("Failed to get route", error=str(e), driver_id=driver_id)
        return jsonify({'error': 'Failed to generate route'}), 500

@app.route('/route/optimize', methods=['POST'])
def optimize_route_endpoint():
    """
    =========================================================================
    OPTIMIZE ROUTE - SAGA STEP
    =========================================================================
    Called by Saga orchestrator to optimize delivery route.
    This is part of the distributed transaction for order creation.
    
    Input: List of stops with addresses
    Output: Optimized route with metrics
    =========================================================================
    """
    try:
        data = request.get_json()
        stops = data.get('stops', [])
        driver_id = data.get('driver_id')
        
        logger.info("Route optimization request", stops_count=len(stops), driver_id=driver_id)
        
        if not stops:
            return jsonify({'error': 'No stops provided'}), 400
        
        # Optimize route
        optimized = optimize_route(stops)
        metrics = calculate_route_metrics(optimized)
        
        # Generate route ID
        route_id = str(uuid.uuid4())
        
        # Save to database if driver_id provided
        if driver_id:
            try:
                conn = get_db_connection()
                cursor = conn.cursor()
                
                cursor.execute("""
                    INSERT INTO routes (id, driver_id, date, optimized, total_distance, estimated_duration)
                    VALUES (%s, (SELECT id FROM drivers WHERE user_id::text = %s OR id::text = %s), 
                            CURRENT_DATE, true, %s, %s)
                    ON CONFLICT DO NOTHING
                """, (route_id, driver_id, driver_id, 
                      metrics['total_distance_km'], metrics['estimated_duration_minutes']))
                
                conn.commit()
                conn.close()
            except Exception as e:
                logger.warning("Failed to save route to database", error=str(e))
        
        response = {
            'success': True,
            'route_id': route_id,
            'optimized_stops': optimized,
            'metrics': metrics,
            'optimization_algorithm': 'nearest_neighbor',
            'timestamp': datetime.utcnow().isoformat()
        }
        
        logger.info("Route optimized successfully", route_id=route_id, 
                   distance=metrics['total_distance_km'])
        
        return jsonify(response)
        
    except Exception as e:
        logger.error("Route optimization failed", error=str(e))
        return jsonify({'error': f'Optimization failed: {str(e)}'}), 500

@app.route('/distance', methods=['POST'])
def calculate_distance():
    """Calculate distance between two points."""
    try:
        data = request.get_json()
        
        origin = data.get('origin', {})
        destination = data.get('destination', {})
        
        lat1 = origin.get('lat', 0)
        lon1 = origin.get('lon', 0)
        lat2 = destination.get('lat', 0)
        lon2 = destination.get('lon', 0)
        
        distance = haversine_distance(lat1, lon1, lat2, lon2)
        
        # Estimate time (30 km/h average in city)
        estimated_time = (distance / 30) * 60  # minutes
        
        return jsonify({
            'distance_km': round(distance, 2),
            'estimated_time_minutes': round(estimated_time),
            'origin': origin,
            'destination': destination
        })
        
    except Exception as e:
        logger.error("Distance calculation failed", error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/eta', methods=['POST'])
def calculate_eta():
    """Calculate estimated time of arrival."""
    try:
        data = request.get_json()
        
        current_location = data.get('current_location', {})
        destination = data.get('destination', {})
        traffic_factor = data.get('traffic_factor', 1.0)  # 1.0 = normal, 1.5 = heavy traffic
        
        lat1 = current_location.get('lat', 40.7128)
        lon1 = current_location.get('lon', -74.0060)
        lat2 = destination.get('lat', 40.7128)
        lon2 = destination.get('lon', -74.0060)
        
        distance = haversine_distance(lat1, lon1, lat2, lon2)
        base_time = (distance / 30) * 60  # minutes at 30 km/h
        adjusted_time = base_time * traffic_factor
        
        eta = datetime.utcnow() + timedelta(minutes=adjusted_time)
        
        return jsonify({
            'eta': eta.isoformat(),
            'eta_formatted': eta.strftime('%I:%M %p'),
            'distance_km': round(distance, 2),
            'estimated_minutes': round(adjusted_time),
            'traffic_factor': traffic_factor
        })
        
    except Exception as e:
        logger.error("ETA calculation failed", error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/geocode', methods=['POST'])
def geocode_address():
    """Mock geocoding service - converts address to coordinates."""
    try:
        data = request.get_json()
        address = data.get('address', '')
        
        # Mock geocoding - in production would use Google Maps API or similar
        # Generate pseudo-random but consistent coordinates based on address
        hash_val = sum(ord(c) for c in address)
        
        # New York City bounds approximately
        lat = 40.7 + (hash_val % 100) / 1000
        lon = -74.0 + (hash_val % 100) / 1000
        
        return jsonify({
            'address': address,
            'coordinates': {
                'lat': round(lat, 6),
                'lon': round(lon, 6)
            },
            'accuracy': 'high',
            'source': 'mock_geocoder'
        })
        
    except Exception as e:
        logger.error("Geocoding failed", error=str(e))
        return jsonify({'error': str(e)}), 500

@app.route('/route/<route_id>/status', methods=['PUT'])
def update_route_status(route_id):
    """Update route status - called when driver completes stops."""
    try:
        data = request.get_json()
        stop_sequence = data.get('stop_sequence')
        status = data.get('status', 'completed')
        
        logger.info("Route status update", route_id=route_id, 
                   stop_sequence=stop_sequence, status=status)
        
        return jsonify({
            'success': True,
            'route_id': route_id,
            'stop_sequence': stop_sequence,
            'status': status,
            'updated_at': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error("Route status update failed", error=str(e))
        return jsonify({'error': str(e)}), 500

# =============================================================================
# COMPENSATION ENDPOINT (For Saga)
# =============================================================================

@app.route('/route/<route_id>/cancel', methods=['POST'])
def cancel_route(route_id):
    """
    =========================================================================
    COMPENSATION - CANCEL ROUTE
    =========================================================================
    Called by Saga orchestrator when order creation fails.
    Removes the optimized route from the system.
    =========================================================================
    """
    try:
        logger.info("Route cancellation request", route_id=route_id)
        
        conn = get_db_connection()
        cursor = conn.cursor()
        
        # Delete route stops first
        cursor.execute("DELETE FROM route_stops WHERE route_id = %s", (route_id,))
        
        # Delete route
        cursor.execute("DELETE FROM routes WHERE id = %s", (route_id,))
        
        conn.commit()
        conn.close()
        
        return jsonify({
            'success': True,
            'route_id': route_id,
            'action': 'cancelled',
            'timestamp': datetime.utcnow().isoformat()
        })
        
    except Exception as e:
        logger.error("Route cancellation failed", error=str(e), route_id=route_id)
        return jsonify({'error': str(e)}), 500

# =============================================================================
# STARTUP
# =============================================================================

if __name__ == '__main__':
    logger.info("Starting ROS REST Service", port=5004)
    app.run(host='0.0.0.0', port=5004, debug=False)
