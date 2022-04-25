'''
This is at the edge of dev-ops and operations. We would like to:
- Confirm that the system is ready to run the Learning Observer.
- Create directories for log files, etc.
- Validate the teacher list file.
- Validate the configuration file exists.
- Download any missing 3rd party files.
- Confirm their integrity.
- Create any directories that don't exist.
'''

import hashlib
import os
import os.path
import shutil
import sys

import learning_observer.paths as paths
import learning_observer.settings as settings
import learning_observer.module_loader as module_loader


STARTUP_CHECKS = []
INIT_FUNCTIONS = []
STARTUP_RAN = False


class StartupCheck(Exception):
    '''
    Exception to be raised when a startup check fails.
    '''
    pass


def register_startup_check(check):
    '''
    Allow modules to register additional checks beyond those defined here. This
    function takes a function that takes no arguments and returns nothing which
    should run after settings are configured, but before the server starts.
    '''
    if STARTUP_RAN:
        raise StartupCheck(
            "Cannot register additional checks after startup checks have been run."
        )
    STARTUP_CHECKS.append(check)


def register_init_function(init):
    '''
    Allow modules to initialize modules after settings are loaded and startup checks have 
    run. This function takes a function that takes no arguments and returns nothing which
    should run before the server starts.
    '''
    if STARTUP_RAN:
        raise StartupCheck(
            "Cannot register additional checks after startup checks have been run."
        )
    INIT_FUNCTIONS.append(init)


# These are directories we'd like created on startup. At the moment,
# they're for different types of log files.
DIRECTORIES = {
    'logs': {'path': paths.logs()},
    'startup logs': {'path': paths.logs('startup')},
    'AJAX logs': {'path': paths.logs('ajax')},
    '3rd party': {'path': paths.third_party()}
}


@register_startup_check
def make_blank_dirs():
    '''
    Create any directories that don't exist for e.g. log files and
    similar.
    '''
    for d in DIRECTORIES:
        dirpath = DIRECTORIES[d]['path']
        if not os.path.exists(dirpath):
            os.mkdir(dirpath)
            print("Made {dirname} directory in {dirpath}".format(
                dirname=d,
                dirpath=dirpath
            ))


@register_startup_check
def validate_teacher_list():
    '''
    Validate the teacher list file. This is a YAML file that contains
    a list of teachers authorized to use the Learning Observer.
    '''
    if not os.path.exists(paths.data("teachers.yaml")):
        shutil.copyfile(
            paths.data("teachers.yaml.template"),
            paths.data("teachers.yaml")
        )
        raise StartupCheck("Created a blank teachers file: static_data/teachers.yaml\n"
              "Populate it with teacher accounts.")


@register_startup_check
def validate_config_file():
    '''
    Validate the configuration file exists. If not, explain how to
    create a configuration file based on the example file.
    '''
    if not os.path.exists(paths.config_file()):
        raise StartupCheck("""
            Copy creds.yaml.sample into the top-level directory:
            cp creds.yaml.sample ../creds.yaml
            Fill in the missing fields.
        """)


@register_startup_check
def download_3rd_party_static():
    '''
    Download any missing third-party files, and confirm their integrity.
    We download only if the file doesn't exist, but confirm integrity
    in both cases.
    '''
    libs = module_loader.third_party()

    for name in libs:
        url = libs[name]['urls'][0]
        sha = libs[name]['hash']

        filename = paths.third_party(name)
        if not os.path.exists(filename):
            os.system("wget {url} -O {filename} 2> /dev/null".format(
                url=url,
                filename=filename
            ))
            print("Downloaded {name}".format(name=name))
        shahash = hashlib.sha3_512(open(filename, "rb").read()).hexdigest()
        if shahash == sha:
            pass
        # print("File integrity of {name} confirmed!".format(name=filename))
        else:
            # Do we want to os.unlink(filename) or just terminate?
            # Probably just terminate, so we can debug.
            error = "File integrity of {name} failed!\n" \
                    "Expected: {sha}\n" \
                    "Got: {shahash}\n" \
                    "We download 3rd party libraries from the Internet. This error means that ones of\n" \
                    "these files changed. This may indicate a man-in-the-middle attack, that a CDN has\n" \
                    "been compromised, or more prosaically, that one of the files had something like\n" \
                    "a security fix backported. In either way, VERIFY what happened before moving on.\n\n" \
                    "If unsure, please consult with a security expert.".format(
                        name=filename,
                        sha=sha,
                        shahash=shahash
                    )
            raise StartupCheck(error)


def startup_checks_and_init():
    '''
    Run a series of checks to ensure that the system is ready to run
    the Learning Observer and create any directories that don't exist.

    We should support asynchronous functions here, but that's a to do. Probably,
    we'd introspect to see whether return values are promises, or have a
    register_sync and a register_async.

    This function should be called at the beginning of the server.

    In the future, we'd like to have something where we can register with a
    priority. The split between checks and intialization felt right, but
    refactoring code, it's wrong. We just have things that need to run at
    startup, and dependencies.
    '''
    for check in STARTUP_CHECKS:
        check()
    for init in INIT_FUNCTIONS:
        init()
    STARTUP_RAN = True


@register_startup_check
def check_aio_session_settings():
    if 'aio' not in settings.settings or \
    'session_secret' not in settings.settings['aio'] or \
    isinstance(settings.settings['aio']['session_secret'], dict) or \
    'session_max_age' not in settings.settings['aio']:
        raise StartupCheck(
            "Settings file needs an `aio` section with a `session_secret`" +
            "subsection containing a secret string. This is used for" +
            "security, and should be set once for each deploy of the platform" +
            "(e.g. if you're running 10 servers, they should all have the" +
            "same secret" +
            "" +
            "Please set an AIO session secret in creds.yaml" +
            "" +
            "Please pick a good session secret. You only need to set it once, and" +
            "the security of the platform relies on a strong, unique password there" +
            "" +
            "This sessions also needs a session_max_age, which sets the number of seconds\n" +
            "of idle time after which a user needs to log back in. 4320 should set\n" +
            "this to 12 hours.\n" +
            "\n" +
            "This should be a long string of random characters. If you can't think\n" +
            "of one, here's one:\n" +
            "" +
            "aio:\n" +
            "session_secret: " +
            str(uuid.uuid5(uuid.uuid1(), str(uuid.uuid4()))) +
            "session_max_age: 4320"
        )