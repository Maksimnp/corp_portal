from xmlrpc.client import ServerProxy
import ssl

context = ssl._create_unverified_context()  # Use only for testing
server = ServerProxy("https://openvpn:Season24@192.1.3.141:943/RPC2", context=context)
try:
    methods = server.system.listMethods()
    print("Available methods:", methods)
except Exception as e:
    print("Error:", e)