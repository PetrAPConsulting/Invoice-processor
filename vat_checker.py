import re
import sys
import requests
import xml.etree.ElementTree as ET
from typing import Optional, Dict

# Configuration
SERVICE_URL = (
    "https://adisrws.mfcr.cz/dpr/axis2/services/rozhraniCRPDPH."
    "rozhraniCRPDPHSOAP"
)
SOAP_ACTION = "getStatusNespolehlivyPlatce"
NS = {"soap": "http://schemas.xmlsoap.org/soap/envelope/",
      "crp": "http://adis.mfcr.cz/rozhraniCRPDPH/"}


def _build_soap_envelope(vat_number: str) -> str:
    """Build the SOAP request body for the operation getStatusNespolehlivyPlatce."""
    envelope = f"""<?xml version="1.0" encoding="UTF-8"?>
<soapenv:Envelope xmlns:soapenv="{NS['soap']}">
  <soapenv:Body>
    <StatusNespolehlivyPlatceRequest xmlns="{NS['crp']}">
      <dic>{vat_number}</dic>
    </StatusNespolehlivyPlatceRequest>
  </soapenv:Body>
</soapenv:Envelope>"""
    return envelope


def _call_service(vat_number: str) -> Optional[ET.Element]:
    """Send the SOAP request and return the parsed XML root (or None on error)."""
    headers = {
        "Content-Type": "text/xml; charset=utf-8",
        "SOAPAction": SOAP_ACTION,
    }

    payload = _build_soap_envelope(vat_number)

    try:
        resp = requests.post(SERVICE_URL,
                             data=payload.encode("utf-8"),
                             headers=headers,
                             timeout=30)
        resp.raise_for_status()
    except Exception as exc:
        print(f"Error contacting service: {exc}", file=sys.stderr)
        return None

    # Parse the XML response
    try:
        root = ET.fromstring(resp.content)
        return root
    except ET.ParseError as exc:
        print(f"Error parsing XML response: {exc}", file=sys.stderr)
        return None


def _interpret_status(status: str) -> tuple[str, str]:
    """Convert the value of nespolehlivyPlatce to status string and boolean value."""
    if status == "ANO":
        return "Unreliable", "false"
    if status == "NE":
        return "Reliable", "true"
    # Anything else (including "NENALEZEN") is treated as not found
    return "Not found", "NA"


def check_vat_reliability(vat_input: str) -> Dict[str, str]:
    """
    Check VAT reliability and return structured response.
    Returns dict with 'status', 'reliable_vat_payer', 'message', 'auto_checked'
    """
    result = {
        'status': 'error',
        'reliable_vat_payer': 'true',  # Default to reliable
        'message': '',
        'auto_checked': True,
        'vat_number_clean': ''
    }
    
    # Strip everything except digits
    vat_number = re.sub(r"\D", "", vat_input)
    result['vat_number_clean'] = vat_number

    if not vat_number:
        result['message'] = "Invalid VAT number - no digits found"
        result['auto_checked'] = False
        return result

    # Call the SOAP service
    root = _call_service(vat_number)
    if root is None:
        result['message'] = "Error: could not get response from VAT service"
        result['auto_checked'] = False
        return result

    # Find the statusPlatceDPH element that matches our VAT number
    xpath = f".//crp:statusPlatceDPH[@dic='{vat_number}']"
    element = root.find(xpath, NS)

    # If the element is missing -> not found
    if element is None:
        result['status'] = 'not_found'
        result['reliable_vat_payer'] = 'NA'
        result['message'] = "VAT payer not found in registry"
        return result

    # Read the attribute nespolehlivyPlatce
    nsp = element.attrib.get("nespolehlivyPlatce", "").strip().upper()
    status_text, reliable_value = _interpret_status(nsp)
    
    result['status'] = 'success'
    result['reliable_vat_payer'] = reliable_value
    result['message'] = f"VAT Tax payer status: {status_text}"
    
    return result


if __name__ == "__main__":
    # Command line interface - outputs JSON for backend integration
    import argparse
    import json
    
    parser = argparse.ArgumentParser(
        description="Check a Czech VAT number (DIC) for reliability "
                    "using the MFCR web-service."
    )
    parser.add_argument(
        "vat",
        help="VAT number (any format, e.g. CZ25083062, 250 830 62, ...)",
    )
    args = parser.parse_args()
    
    result = check_vat_reliability(args.vat)
    print(json.dumps(result))