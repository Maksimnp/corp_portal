import ldap
from typing import Dict  

def authenticate_user(username: str, password: str) -> Dict[str, str]:
    try:
        LDAP_SERVER = "ldap://192.1.3.6:389"
        LDAP_DOMAIN = "mhp.net"
        BASE_DN = "DC=mhp,DC=net"  
        conn = ldap.initialize(LDAP_SERVER)
        conn.set_option(ldap.OPT_REFERRALS, 0)
        

        bind_dn = f"{username}@{LDAP_DOMAIN}"
        conn.simple_bind_s(bind_dn, password)

        search_filter = f"(sAMAccountName={username})"
        attrs = ['displayName', 'sAMAccountName']
        result = conn.search_s(BASE_DN, ldap.SCOPE_SUBTREE, search_filter, attrs)
        
        if result and len(result) > 0:
            user_dn, user_attrs = result[0]
            full_name = user_attrs.get('displayName', [b''])[0].decode('utf-8') if user_attrs.get('displayName') else username
            print(f"Successfully authenticated user: {username}, Full Name: {full_name}")
            return {"username": username, "full_name": full_name}
        else:
            print(f"No user found for username: {username}")
            return None
    except ldap.INVALID_CREDENTIALS:
        print(f"Invalid credentials for user: {username}")
        return None
    except ldap.SERVER_DOWN:
        print(f"LDAP server is down: {LDAP_SERVER}")
        return None
    except ldap.LDAPError as e:
        print(f"LDAP error for user {username}: {e}")
        return None
    finally:
        if 'conn' in locals():
            conn.unbind_s()

def get_user_role(username: str) -> str:
    print(f"Getting role for user: {username}")
    return "admin" if username in ["mnp", "k.dyatel"] else "user"