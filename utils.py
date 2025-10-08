import os

def env_or_raise(name):
    v = os.environ.get(name)
    if not v:
        raise EnvironmentError(f'La variable {name} no está configurada')
    return v
