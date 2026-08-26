...FF......sssssss.sss.sss.ss.ss.ssss.Fsssssssss.....sss.ss.ssss.sss.sss [ 62%]
sss..................FFFsFFFFssFs...........                             [100%]
=================================== FAILURES ===================================
__________________ TestDetectOpenssl.test_finds_some_openssl ___________________

self = <tests.test_cert_generator.TestDetectOpenssl object at 0x1084d1550>

    def test_finds_some_openssl(self):
        from app.services.cert_generator import detect_openssl
        result = detect_openssl()
>       assert result["path"] is not None, "No openssl found in PATH or bundled"
E       AssertionError: No openssl found in PATH or bundled
E       assert None is not None

tests/test_cert_generator.py:42: AssertionError
_________________ TestDetectOpenssl.test_collects_detect_logs __________________

self = <tests.test_cert_generator.TestDetectOpenssl object at 0x1084d1c50>

    def test_collects_detect_logs(self):
        from app.services.cert_generator import detect_openssl, CommandResult
        logs: list[CommandResult] = []
        detect_openssl(detect_logs=logs)
>       assert len(logs) >= 1
E       assert 0 >= 1
E        +  where 0 = len([])

tests/test_cert_generator.py:48: AssertionError
_______________ TestLocalProvider.test_provider_detects_openssl ________________

self = <tests.test_cert_generator.TestLocalProvider object at 0x1084fc9d0>

    def test_provider_detects_openssl(self):
        from app.services.cert_generator import LocalProvider
        provider = LocalProvider()
>       assert provider.openssl_path is not None
E       assert None is not None
E        +  where None = <app.services.cert_generator.LocalProvider object at 0x1085765d0>.openssl_path

tests/test_cert_generator.py:629: AssertionError
_____ TestGenerateLocalServerCert.test_rsa_server_sni_contains_edge_local ______

self = <tests.test_ssl_reserved_sni.TestGenerateLocalServerCert object at 0x108516c10>
test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10a73f6d0>

    async def test_rsa_server_sni_contains_edge_local(self, test_db):
>       ca_id = await _create_ca(test_db, "rsa")
                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

tests/test_ssl_reserved_sni.py:170: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10a73f6d0>
algorithm = 'rsa'

    async def _create_ca(test_db, algorithm: str = "rsa") -> int:
        """Create a real CA record in test_db, return its id."""
        from app.services.cert_generator import generate_ca_certificate, detect_openssl
    
        info = detect_openssl()
        if algorithm == "sm2" and not info["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
>       result, _ = generate_ca_certificate(
            openssl_path=info["path"],
            common_name=f"Test CA {algorithm}",
            validity_days=3650,
            flavor=info["flavor"],
            algorithm=algorithm,
        )

tests/test_ssl_reserved_sni.py:47: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None, common_name = 'Test CA rsa', validity_days = 3650
flavor = 'unknown', algorithm = 'rsa', org = 'EMBRACE', ou = 'EDGE'

    def generate_ca_certificate(
        openssl_path: str,
        common_name: str,
        validity_days: int,
        flavor: str,
        algorithm: str = "sm2",
        org: str = "EMBRACE",
        ou: str = "EDGE",
    ) -> tuple[dict, list[CommandResult]]:
        """Generate a self-signed CA root certificate.
    
        Supports sm2, rsa, and ecc algorithms.
    
        Returns (result_dict, logs) where result_dict has keys: ca_cert, ca_key.
        """
        logs: list[CommandResult] = []
    
        hash_alg = "sm3" if algorithm == "sm2" else "sha256"
    
        if algorithm == "sm2":
            ca_key, key_logs = generate_sm2_keypair(openssl_path)
        elif algorithm == "rsa":
>           ca_key, key_logs = generate_rsa_keypair(openssl_path)
                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

app/services/cert_generator.py:435: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None

    def generate_rsa_keypair(openssl_path: str) -> tuple[str, list[CommandResult]]:
        """Generate an RSA 2048-bit key pair. Returns (private_key_pem, logs)."""
        with tempfile.TemporaryDirectory(prefix="panshi_rsa_") as tmpdir:
            key_file = Path(tmpdir) / "rsa.key"
>           result = _run_openssl(
                ["genrsa", "-out", str(key_file), "2048"],
                openssl_path,
            )

app/services/cert_generator.py:181: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

cmd = ['genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_vwiyly8p/rsa.key', '2048']
openssl_path = None

    def _run_openssl(cmd: list[str], openssl_path: str) -> CommandResult:
        """Run an openssl command and return the result with command info."""
        full_cmd = [openssl_path] + cmd
>       result = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )

app/services/cert_generator.py:69: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

input = None, capture_output = True, timeout = 30, check = False
popenargs = ([None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_vwiyly8p/rsa.key', '2048'],)
kwargs = {'stderr': -1, 'stdout': -1, 'text': True}

    def run(*popenargs,
            input=None, capture_output=False, timeout=None, check=False, **kwargs):
        """Run command with arguments and return a CompletedProcess instance.
    
        The returned instance will have attributes args, returncode, stdout and
        stderr. By default, stdout and stderr are not captured, and those attributes
        will be None. Pass stdout=PIPE and/or stderr=PIPE in order to capture them,
        or pass capture_output=True to capture both.
    
        If check is True and the exit code was non-zero, it raises a
        CalledProcessError. The CalledProcessError object will have the return code
        in the returncode attribute, and output & stderr attributes if those streams
        were captured.
    
        If timeout is given, and the process takes too long, a TimeoutExpired
        exception will be raised.
    
        There is an optional argument "input", allowing you to
        pass bytes or a string to the subprocess's stdin.  If you use this argument
        you may not also use the Popen constructor's "stdin" argument, as
        it will be used internally.
    
        By default, all communication is in bytes, and therefore any "input" should
        be bytes, and the stdout and stderr will be bytes. If in text mode, any
        "input" should be a string, and stdout and stderr will be strings decoded
        according to locale encoding, or by "encoding" if set. Text mode is
        triggered by setting any of text, encoding, errors or universal_newlines.
    
        The other arguments are the same as for the Popen constructor.
        """
        if input is not None:
            if kwargs.get('stdin') is not None:
                raise ValueError('stdin and input arguments may not both be used.')
            kwargs['stdin'] = PIPE
    
        if capture_output:
            if kwargs.get('stdout') is not None or kwargs.get('stderr') is not None:
                raise ValueError('stdout and stderr arguments may not be used '
                                 'with capture_output.')
            kwargs['stdout'] = PIPE
            kwargs['stderr'] = PIPE
    
>       with Popen(*popenargs, **kwargs) as process:
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:548: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_vwiyly8p/rsa.key', '2048']
bufsize = -1, executable = None, stdin = None, stdout = -1, stderr = -1
preexec_fn = None, close_fds = True, shell = False, cwd = None, env = None
universal_newlines = None, startupinfo = None, creationflags = 0
restore_signals = True, start_new_session = False, pass_fds = ()

    def __init__(self, args, bufsize=-1, executable=None,
                 stdin=None, stdout=None, stderr=None,
                 preexec_fn=None, close_fds=True,
                 shell=False, cwd=None, env=None, universal_newlines=None,
                 startupinfo=None, creationflags=0,
                 restore_signals=True, start_new_session=False,
                 pass_fds=(), *, user=None, group=None, extra_groups=None,
                 encoding=None, errors=None, text=None, umask=-1, pipesize=-1,
                 process_group=None):
        """Create new Popen instance."""
        if not _can_fork_exec:
            raise OSError(
                errno.ENOTSUP, f"{sys.platform} does not support processes."
            )
    
        _cleanup()
        # Held while anything is calling waitpid before returncode has been
        # updated to prevent clobbering returncode if wait() or poll() are
        # called from multiple threads at once.  After acquiring the lock,
        # code must re-check self.returncode to see if another thread just
        # finished a waitpid() call.
        self._waitpid_lock = threading.Lock()
    
        self._input = None
        self._communication_started = False
        if bufsize is None:
            bufsize = -1  # Restore default
        if not isinstance(bufsize, int):
            raise TypeError("bufsize must be an integer")
    
        if pipesize is None:
            pipesize = -1  # Restore default
        if not isinstance(pipesize, int):
            raise TypeError("pipesize must be an integer")
    
        if _mswindows:
            if preexec_fn is not None:
                raise ValueError("preexec_fn is not supported on Windows "
                                 "platforms")
        else:
            # POSIX
            if pass_fds and not close_fds:
                warnings.warn("pass_fds overriding close_fds.", RuntimeWarning)
                close_fds = True
            if startupinfo is not None:
                raise ValueError("startupinfo is only supported on Windows "
                                 "platforms")
            if creationflags != 0:
                raise ValueError("creationflags is only supported on Windows "
                                 "platforms")
    
        self.args = args
        self.stdin = None
        self.stdout = None
        self.stderr = None
        self.pid = None
        self.returncode = None
        self.encoding = encoding
        self.errors = errors
        self.pipesize = pipesize
    
        # Validate the combinations of text and universal_newlines
        if (text is not None and universal_newlines is not None
            and bool(universal_newlines) != bool(text)):
            raise SubprocessError('Cannot disambiguate when both text '
                                  'and universal_newlines are supplied but '
                                  'different. Pass one or the other.')
    
        self.text_mode = encoding or errors or text or universal_newlines
        if self.text_mode and encoding is None:
            self.encoding = encoding = _text_encoding()
    
        # How long to resume waiting on a child after the first ^C.
        # There is no right value for this.  The purpose is to be polite
        # yet remain good for interactive users trying to exit a tool.
        self._sigint_wait_secs = 0.25  # 1/xkcd221.getRandomNumber()
    
        self._closed_child_pipe_fds = False
    
        if self.text_mode:
            if bufsize == 1:
                line_buffering = True
                # Use the default buffer size for the underlying binary streams
                # since they don't support line buffering.
                bufsize = -1
            else:
                line_buffering = False
    
        if process_group is None:
            process_group = -1  # The internal APIs are int-only
    
        gid = None
        if group is not None:
            if not hasattr(os, 'setregid'):
                raise ValueError("The 'group' parameter is not supported on the "
                                 "current platform")
    
            elif isinstance(group, str):
                try:
                    import grp
                except ImportError:
                    raise ValueError("The group parameter cannot be a string "
                                     "on systems without the grp module")
    
                gid = grp.getgrnam(group).gr_gid
            elif isinstance(group, int):
                gid = group
            else:
                raise TypeError("Group must be a string or an integer, not {}"
                                .format(type(group)))
    
            if gid < 0:
                raise ValueError(f"Group ID cannot be negative, got {gid}")
    
        gids = None
        if extra_groups is not None:
            if not hasattr(os, 'setgroups'):
                raise ValueError("The 'extra_groups' parameter is not "
                                 "supported on the current platform")
    
            elif isinstance(extra_groups, str):
                raise ValueError("Groups must be a list, not a string")
    
            gids = []
            for extra_group in extra_groups:
                if isinstance(extra_group, str):
                    try:
                        import grp
                    except ImportError:
                        raise ValueError("Items in extra_groups cannot be "
                                         "strings on systems without the "
                                         "grp module")
    
                    gids.append(grp.getgrnam(extra_group).gr_gid)
                elif isinstance(extra_group, int):
                    gids.append(extra_group)
                else:
                    raise TypeError("Items in extra_groups must be a string "
                                    "or integer, not {}"
                                    .format(type(extra_group)))
    
            # make sure that the gids are all positive here so we can do less
            # checking in the C code
            for gid_check in gids:
                if gid_check < 0:
                    raise ValueError(f"Group ID cannot be negative, got {gid_check}")
    
        uid = None
        if user is not None:
            if not hasattr(os, 'setreuid'):
                raise ValueError("The 'user' parameter is not supported on "
                                 "the current platform")
    
            elif isinstance(user, str):
                try:
                    import pwd
                except ImportError:
                    raise ValueError("The user parameter cannot be a string "
                                     "on systems without the pwd module")
                uid = pwd.getpwnam(user).pw_uid
            elif isinstance(user, int):
                uid = user
            else:
                raise TypeError("User must be a string or an integer")
    
            if uid < 0:
                raise ValueError(f"User ID cannot be negative, got {uid}")
    
        # Input and output objects. The general principle is like
        # this:
        #
        # Parent                   Child
        # ------                   -----
        # p2cwrite   ---stdin--->  p2cread
        # c2pread    <--stdout---  c2pwrite
        # errread    <--stderr---  errwrite
        #
        # On POSIX, the child objects are file descriptors.  On
        # Windows, these are Windows file handles.  The parent objects
        # are file descriptors on both platforms.  The parent objects
        # are -1 when not using PIPEs. The child objects are -1
        # when not redirecting.
    
        (p2cread, p2cwrite,
         c2pread, c2pwrite,
         errread, errwrite) = self._get_handles(stdin, stdout, stderr)
    
        # From here on, raising exceptions may cause file descriptor leakage
    
        # We wrap OS handles *before* launching the child, otherwise a
        # quickly terminating child could make our fds unwrappable
        # (see #8458).
    
        if _mswindows:
            if p2cwrite != -1:
                p2cwrite = msvcrt.open_osfhandle(p2cwrite.Detach(), 0)
            if c2pread != -1:
                c2pread = msvcrt.open_osfhandle(c2pread.Detach(), 0)
            if errread != -1:
                errread = msvcrt.open_osfhandle(errread.Detach(), 0)
    
        try:
            if p2cwrite != -1:
                self.stdin = io.open(p2cwrite, 'wb', bufsize)
                if self.text_mode:
                    self.stdin = io.TextIOWrapper(self.stdin, write_through=True,
                            line_buffering=line_buffering,
                            encoding=encoding, errors=errors)
            if c2pread != -1:
                self.stdout = io.open(c2pread, 'rb', bufsize)
                if self.text_mode:
                    self.stdout = io.TextIOWrapper(self.stdout,
                            encoding=encoding, errors=errors)
            if errread != -1:
                self.stderr = io.open(errread, 'rb', bufsize)
                if self.text_mode:
                    self.stderr = io.TextIOWrapper(self.stderr,
                            encoding=encoding, errors=errors)
    
>           self._execute_child(args, executable, preexec_fn, close_fds,
                                pass_fds, cwd, env,
                                startupinfo, creationflags, shell,
                                p2cread, p2cwrite,
                                c2pread, c2pwrite,
                                errread, errwrite,
                                restore_signals,
                                gid, gids, uid, umask,
                                start_new_session, process_group)

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1026: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_vwiyly8p/rsa.key', '2048']
executable = None, preexec_fn = None, close_fds = True, pass_fds = ()
cwd = None, env = None, startupinfo = None, creationflags = 0, shell = False
p2cread = -1, p2cwrite = -1, c2pread = 14, c2pwrite = 15, errread = 16
errwrite = 17, restore_signals = True, gid = None, gids = None, uid = None
umask = -1, start_new_session = False, process_group = -1

    def _execute_child(self, args, executable, preexec_fn, close_fds,
                       pass_fds, cwd, env,
                       startupinfo, creationflags, shell,
                       p2cread, p2cwrite,
                       c2pread, c2pwrite,
                       errread, errwrite,
                       restore_signals,
                       gid, gids, uid, umask,
                       start_new_session, process_group):
        """Execute program (POSIX version)"""
    
        if isinstance(args, (str, bytes)):
            args = [args]
        elif isinstance(args, os.PathLike):
            if shell:
                raise TypeError('path-like args is not allowed when '
                                'shell is true')
            args = [args]
        else:
            args = list(args)
    
        if shell:
            # On Android the default shell is at '/system/bin/sh'.
            unix_shell = ('/system/bin/sh' if
                      hasattr(sys, 'getandroidapilevel') else '/bin/sh')
            args = [unix_shell, "-c"] + args
            if executable:
                args[0] = executable
    
        if executable is None:
            executable = args[0]
    
        sys.audit("subprocess.Popen", executable, args, cwd, env)
    
        if (_USE_POSIX_SPAWN
>               and os.path.dirname(executable)
                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^
                and preexec_fn is None
                and not close_fds
                and not pass_fds
                and cwd is None
                and (p2cread == -1 or p2cread > 2)
                and (c2pwrite == -1 or c2pwrite > 2)
                and (errwrite == -1 or errwrite > 2)
                and not start_new_session
                and process_group == -1
                and gid is None
                and gids is None
                and uid is None
                and umask < 0):

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1826: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

p = None

>   ???
E   TypeError: expected str, bytes or os.PathLike object, not NoneType

<frozen posixpath>:152: TypeError
___ TestGenerateLocalServerCert.test_rsa_server_cert_san_contains_edge_local ___

self = <tests.test_ssl_reserved_sni.TestGenerateLocalServerCert object at 0x1085175d0>
test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10bc954d0>

    async def test_rsa_server_cert_san_contains_edge_local(self, test_db):
>       ca_id = await _create_ca(test_db, "rsa")
                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

tests/test_ssl_reserved_sni.py:176: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10bc954d0>
algorithm = 'rsa'

    async def _create_ca(test_db, algorithm: str = "rsa") -> int:
        """Create a real CA record in test_db, return its id."""
        from app.services.cert_generator import generate_ca_certificate, detect_openssl
    
        info = detect_openssl()
        if algorithm == "sm2" and not info["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
>       result, _ = generate_ca_certificate(
            openssl_path=info["path"],
            common_name=f"Test CA {algorithm}",
            validity_days=3650,
            flavor=info["flavor"],
            algorithm=algorithm,
        )

tests/test_ssl_reserved_sni.py:47: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None, common_name = 'Test CA rsa', validity_days = 3650
flavor = 'unknown', algorithm = 'rsa', org = 'EMBRACE', ou = 'EDGE'

    def generate_ca_certificate(
        openssl_path: str,
        common_name: str,
        validity_days: int,
        flavor: str,
        algorithm: str = "sm2",
        org: str = "EMBRACE",
        ou: str = "EDGE",
    ) -> tuple[dict, list[CommandResult]]:
        """Generate a self-signed CA root certificate.
    
        Supports sm2, rsa, and ecc algorithms.
    
        Returns (result_dict, logs) where result_dict has keys: ca_cert, ca_key.
        """
        logs: list[CommandResult] = []
    
        hash_alg = "sm3" if algorithm == "sm2" else "sha256"
    
        if algorithm == "sm2":
            ca_key, key_logs = generate_sm2_keypair(openssl_path)
        elif algorithm == "rsa":
>           ca_key, key_logs = generate_rsa_keypair(openssl_path)
                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

app/services/cert_generator.py:435: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None

    def generate_rsa_keypair(openssl_path: str) -> tuple[str, list[CommandResult]]:
        """Generate an RSA 2048-bit key pair. Returns (private_key_pem, logs)."""
        with tempfile.TemporaryDirectory(prefix="panshi_rsa_") as tmpdir:
            key_file = Path(tmpdir) / "rsa.key"
>           result = _run_openssl(
                ["genrsa", "-out", str(key_file), "2048"],
                openssl_path,
            )

app/services/cert_generator.py:181: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

cmd = ['genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_9fx_56uz/rsa.key', '2048']
openssl_path = None

    def _run_openssl(cmd: list[str], openssl_path: str) -> CommandResult:
        """Run an openssl command and return the result with command info."""
        full_cmd = [openssl_path] + cmd
>       result = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )

app/services/cert_generator.py:69: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

input = None, capture_output = True, timeout = 30, check = False
popenargs = ([None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_9fx_56uz/rsa.key', '2048'],)
kwargs = {'stderr': -1, 'stdout': -1, 'text': True}

    def run(*popenargs,
            input=None, capture_output=False, timeout=None, check=False, **kwargs):
        """Run command with arguments and return a CompletedProcess instance.
    
        The returned instance will have attributes args, returncode, stdout and
        stderr. By default, stdout and stderr are not captured, and those attributes
        will be None. Pass stdout=PIPE and/or stderr=PIPE in order to capture them,
        or pass capture_output=True to capture both.
    
        If check is True and the exit code was non-zero, it raises a
        CalledProcessError. The CalledProcessError object will have the return code
        in the returncode attribute, and output & stderr attributes if those streams
        were captured.
    
        If timeout is given, and the process takes too long, a TimeoutExpired
        exception will be raised.
    
        There is an optional argument "input", allowing you to
        pass bytes or a string to the subprocess's stdin.  If you use this argument
        you may not also use the Popen constructor's "stdin" argument, as
        it will be used internally.
    
        By default, all communication is in bytes, and therefore any "input" should
        be bytes, and the stdout and stderr will be bytes. If in text mode, any
        "input" should be a string, and stdout and stderr will be strings decoded
        according to locale encoding, or by "encoding" if set. Text mode is
        triggered by setting any of text, encoding, errors or universal_newlines.
    
        The other arguments are the same as for the Popen constructor.
        """
        if input is not None:
            if kwargs.get('stdin') is not None:
                raise ValueError('stdin and input arguments may not both be used.')
            kwargs['stdin'] = PIPE
    
        if capture_output:
            if kwargs.get('stdout') is not None or kwargs.get('stderr') is not None:
                raise ValueError('stdout and stderr arguments may not be used '
                                 'with capture_output.')
            kwargs['stdout'] = PIPE
            kwargs['stderr'] = PIPE
    
>       with Popen(*popenargs, **kwargs) as process:
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:548: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_9fx_56uz/rsa.key', '2048']
bufsize = -1, executable = None, stdin = None, stdout = -1, stderr = -1
preexec_fn = None, close_fds = True, shell = False, cwd = None, env = None
universal_newlines = None, startupinfo = None, creationflags = 0
restore_signals = True, start_new_session = False, pass_fds = ()

    def __init__(self, args, bufsize=-1, executable=None,
                 stdin=None, stdout=None, stderr=None,
                 preexec_fn=None, close_fds=True,
                 shell=False, cwd=None, env=None, universal_newlines=None,
                 startupinfo=None, creationflags=0,
                 restore_signals=True, start_new_session=False,
                 pass_fds=(), *, user=None, group=None, extra_groups=None,
                 encoding=None, errors=None, text=None, umask=-1, pipesize=-1,
                 process_group=None):
        """Create new Popen instance."""
        if not _can_fork_exec:
            raise OSError(
                errno.ENOTSUP, f"{sys.platform} does not support processes."
            )
    
        _cleanup()
        # Held while anything is calling waitpid before returncode has been
        # updated to prevent clobbering returncode if wait() or poll() are
        # called from multiple threads at once.  After acquiring the lock,
        # code must re-check self.returncode to see if another thread just
        # finished a waitpid() call.
        self._waitpid_lock = threading.Lock()
    
        self._input = None
        self._communication_started = False
        if bufsize is None:
            bufsize = -1  # Restore default
        if not isinstance(bufsize, int):
            raise TypeError("bufsize must be an integer")
    
        if pipesize is None:
            pipesize = -1  # Restore default
        if not isinstance(pipesize, int):
            raise TypeError("pipesize must be an integer")
    
        if _mswindows:
            if preexec_fn is not None:
                raise ValueError("preexec_fn is not supported on Windows "
                                 "platforms")
        else:
            # POSIX
            if pass_fds and not close_fds:
                warnings.warn("pass_fds overriding close_fds.", RuntimeWarning)
                close_fds = True
            if startupinfo is not None:
                raise ValueError("startupinfo is only supported on Windows "
                                 "platforms")
            if creationflags != 0:
                raise ValueError("creationflags is only supported on Windows "
                                 "platforms")
    
        self.args = args
        self.stdin = None
        self.stdout = None
        self.stderr = None
        self.pid = None
        self.returncode = None
        self.encoding = encoding
        self.errors = errors
        self.pipesize = pipesize
    
        # Validate the combinations of text and universal_newlines
        if (text is not None and universal_newlines is not None
            and bool(universal_newlines) != bool(text)):
            raise SubprocessError('Cannot disambiguate when both text '
                                  'and universal_newlines are supplied but '
                                  'different. Pass one or the other.')
    
        self.text_mode = encoding or errors or text or universal_newlines
        if self.text_mode and encoding is None:
            self.encoding = encoding = _text_encoding()
    
        # How long to resume waiting on a child after the first ^C.
        # There is no right value for this.  The purpose is to be polite
        # yet remain good for interactive users trying to exit a tool.
        self._sigint_wait_secs = 0.25  # 1/xkcd221.getRandomNumber()
    
        self._closed_child_pipe_fds = False
    
        if self.text_mode:
            if bufsize == 1:
                line_buffering = True
                # Use the default buffer size for the underlying binary streams
                # since they don't support line buffering.
                bufsize = -1
            else:
                line_buffering = False
    
        if process_group is None:
            process_group = -1  # The internal APIs are int-only
    
        gid = None
        if group is not None:
            if not hasattr(os, 'setregid'):
                raise ValueError("The 'group' parameter is not supported on the "
                                 "current platform")
    
            elif isinstance(group, str):
                try:
                    import grp
                except ImportError:
                    raise ValueError("The group parameter cannot be a string "
                                     "on systems without the grp module")
    
                gid = grp.getgrnam(group).gr_gid
            elif isinstance(group, int):
                gid = group
            else:
                raise TypeError("Group must be a string or an integer, not {}"
                                .format(type(group)))
    
            if gid < 0:
                raise ValueError(f"Group ID cannot be negative, got {gid}")
    
        gids = None
        if extra_groups is not None:
            if not hasattr(os, 'setgroups'):
                raise ValueError("The 'extra_groups' parameter is not "
                                 "supported on the current platform")
    
            elif isinstance(extra_groups, str):
                raise ValueError("Groups must be a list, not a string")
    
            gids = []
            for extra_group in extra_groups:
                if isinstance(extra_group, str):
                    try:
                        import grp
                    except ImportError:
                        raise ValueError("Items in extra_groups cannot be "
                                         "strings on systems without the "
                                         "grp module")
    
                    gids.append(grp.getgrnam(extra_group).gr_gid)
                elif isinstance(extra_group, int):
                    gids.append(extra_group)
                else:
                    raise TypeError("Items in extra_groups must be a string "
                                    "or integer, not {}"
                                    .format(type(extra_group)))
    
            # make sure that the gids are all positive here so we can do less
            # checking in the C code
            for gid_check in gids:
                if gid_check < 0:
                    raise ValueError(f"Group ID cannot be negative, got {gid_check}")
    
        uid = None
        if user is not None:
            if not hasattr(os, 'setreuid'):
                raise ValueError("The 'user' parameter is not supported on "
                                 "the current platform")
    
            elif isinstance(user, str):
                try:
                    import pwd
                except ImportError:
                    raise ValueError("The user parameter cannot be a string "
                                     "on systems without the pwd module")
                uid = pwd.getpwnam(user).pw_uid
            elif isinstance(user, int):
                uid = user
            else:
                raise TypeError("User must be a string or an integer")
    
            if uid < 0:
                raise ValueError(f"User ID cannot be negative, got {uid}")
    
        # Input and output objects. The general principle is like
        # this:
        #
        # Parent                   Child
        # ------                   -----
        # p2cwrite   ---stdin--->  p2cread
        # c2pread    <--stdout---  c2pwrite
        # errread    <--stderr---  errwrite
        #
        # On POSIX, the child objects are file descriptors.  On
        # Windows, these are Windows file handles.  The parent objects
        # are file descriptors on both platforms.  The parent objects
        # are -1 when not using PIPEs. The child objects are -1
        # when not redirecting.
    
        (p2cread, p2cwrite,
         c2pread, c2pwrite,
         errread, errwrite) = self._get_handles(stdin, stdout, stderr)
    
        # From here on, raising exceptions may cause file descriptor leakage
    
        # We wrap OS handles *before* launching the child, otherwise a
        # quickly terminating child could make our fds unwrappable
        # (see #8458).
    
        if _mswindows:
            if p2cwrite != -1:
                p2cwrite = msvcrt.open_osfhandle(p2cwrite.Detach(), 0)
            if c2pread != -1:
                c2pread = msvcrt.open_osfhandle(c2pread.Detach(), 0)
            if errread != -1:
                errread = msvcrt.open_osfhandle(errread.Detach(), 0)
    
        try:
            if p2cwrite != -1:
                self.stdin = io.open(p2cwrite, 'wb', bufsize)
                if self.text_mode:
                    self.stdin = io.TextIOWrapper(self.stdin, write_through=True,
                            line_buffering=line_buffering,
                            encoding=encoding, errors=errors)
            if c2pread != -1:
                self.stdout = io.open(c2pread, 'rb', bufsize)
                if self.text_mode:
                    self.stdout = io.TextIOWrapper(self.stdout,
                            encoding=encoding, errors=errors)
            if errread != -1:
                self.stderr = io.open(errread, 'rb', bufsize)
                if self.text_mode:
                    self.stderr = io.TextIOWrapper(self.stderr,
                            encoding=encoding, errors=errors)
    
>           self._execute_child(args, executable, preexec_fn, close_fds,
                                pass_fds, cwd, env,
                                startupinfo, creationflags, shell,
                                p2cread, p2cwrite,
                                c2pread, c2pwrite,
                                errread, errwrite,
                                restore_signals,
                                gid, gids, uid, umask,
                                start_new_session, process_group)

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1026: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_9fx_56uz/rsa.key', '2048']
executable = None, preexec_fn = None, close_fds = True, pass_fds = ()
cwd = None, env = None, startupinfo = None, creationflags = 0, shell = False
p2cread = -1, p2cwrite = -1, c2pread = 14, c2pwrite = 15, errread = 16
errwrite = 17, restore_signals = True, gid = None, gids = None, uid = None
umask = -1, start_new_session = False, process_group = -1

    def _execute_child(self, args, executable, preexec_fn, close_fds,
                       pass_fds, cwd, env,
                       startupinfo, creationflags, shell,
                       p2cread, p2cwrite,
                       c2pread, c2pwrite,
                       errread, errwrite,
                       restore_signals,
                       gid, gids, uid, umask,
                       start_new_session, process_group):
        """Execute program (POSIX version)"""
    
        if isinstance(args, (str, bytes)):
            args = [args]
        elif isinstance(args, os.PathLike):
            if shell:
                raise TypeError('path-like args is not allowed when '
                                'shell is true')
            args = [args]
        else:
            args = list(args)
    
        if shell:
            # On Android the default shell is at '/system/bin/sh'.
            unix_shell = ('/system/bin/sh' if
                      hasattr(sys, 'getandroidapilevel') else '/bin/sh')
            args = [unix_shell, "-c"] + args
            if executable:
                args[0] = executable
    
        if executable is None:
            executable = args[0]
    
        sys.audit("subprocess.Popen", executable, args, cwd, env)
    
        if (_USE_POSIX_SPAWN
>               and os.path.dirname(executable)
                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^
                and preexec_fn is None
                and not close_fds
                and not pass_fds
                and cwd is None
                and (p2cread == -1 or p2cread > 2)
                and (c2pwrite == -1 or c2pwrite > 2)
                and (errwrite == -1 or errwrite > 2)
                and not start_new_session
                and process_group == -1
                and gid is None
                and gids is None
                and uid is None
                and umask < 0):

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1826: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

p = None

>   ???
E   TypeError: expected str, bytes or os.PathLike object, not NoneType

<frozen posixpath>:152: TypeError
___ TestGenerateLocalServerCert.test_ecc_server_cert_san_contains_edge_local ___

self = <tests.test_ssl_reserved_sni.TestGenerateLocalServerCert object at 0x108517fd0>
test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10bae8090>

    async def test_ecc_server_cert_san_contains_edge_local(self, test_db):
>       ca_id = await _create_ca(test_db, "rsa")
                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

tests/test_ssl_reserved_sni.py:183: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10bae8090>
algorithm = 'rsa'

    async def _create_ca(test_db, algorithm: str = "rsa") -> int:
        """Create a real CA record in test_db, return its id."""
        from app.services.cert_generator import generate_ca_certificate, detect_openssl
    
        info = detect_openssl()
        if algorithm == "sm2" and not info["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
>       result, _ = generate_ca_certificate(
            openssl_path=info["path"],
            common_name=f"Test CA {algorithm}",
            validity_days=3650,
            flavor=info["flavor"],
            algorithm=algorithm,
        )

tests/test_ssl_reserved_sni.py:47: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None, common_name = 'Test CA rsa', validity_days = 3650
flavor = 'unknown', algorithm = 'rsa', org = 'EMBRACE', ou = 'EDGE'

    def generate_ca_certificate(
        openssl_path: str,
        common_name: str,
        validity_days: int,
        flavor: str,
        algorithm: str = "sm2",
        org: str = "EMBRACE",
        ou: str = "EDGE",
    ) -> tuple[dict, list[CommandResult]]:
        """Generate a self-signed CA root certificate.
    
        Supports sm2, rsa, and ecc algorithms.
    
        Returns (result_dict, logs) where result_dict has keys: ca_cert, ca_key.
        """
        logs: list[CommandResult] = []
    
        hash_alg = "sm3" if algorithm == "sm2" else "sha256"
    
        if algorithm == "sm2":
            ca_key, key_logs = generate_sm2_keypair(openssl_path)
        elif algorithm == "rsa":
>           ca_key, key_logs = generate_rsa_keypair(openssl_path)
                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

app/services/cert_generator.py:435: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None

    def generate_rsa_keypair(openssl_path: str) -> tuple[str, list[CommandResult]]:
        """Generate an RSA 2048-bit key pair. Returns (private_key_pem, logs)."""
        with tempfile.TemporaryDirectory(prefix="panshi_rsa_") as tmpdir:
            key_file = Path(tmpdir) / "rsa.key"
>           result = _run_openssl(
                ["genrsa", "-out", str(key_file), "2048"],
                openssl_path,
            )

app/services/cert_generator.py:181: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

cmd = ['genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_h60b0wz6/rsa.key', '2048']
openssl_path = None

    def _run_openssl(cmd: list[str], openssl_path: str) -> CommandResult:
        """Run an openssl command and return the result with command info."""
        full_cmd = [openssl_path] + cmd
>       result = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )

app/services/cert_generator.py:69: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

input = None, capture_output = True, timeout = 30, check = False
popenargs = ([None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_h60b0wz6/rsa.key', '2048'],)
kwargs = {'stderr': -1, 'stdout': -1, 'text': True}

    def run(*popenargs,
            input=None, capture_output=False, timeout=None, check=False, **kwargs):
        """Run command with arguments and return a CompletedProcess instance.
    
        The returned instance will have attributes args, returncode, stdout and
        stderr. By default, stdout and stderr are not captured, and those attributes
        will be None. Pass stdout=PIPE and/or stderr=PIPE in order to capture them,
        or pass capture_output=True to capture both.
    
        If check is True and the exit code was non-zero, it raises a
        CalledProcessError. The CalledProcessError object will have the return code
        in the returncode attribute, and output & stderr attributes if those streams
        were captured.
    
        If timeout is given, and the process takes too long, a TimeoutExpired
        exception will be raised.
    
        There is an optional argument "input", allowing you to
        pass bytes or a string to the subprocess's stdin.  If you use this argument
        you may not also use the Popen constructor's "stdin" argument, as
        it will be used internally.
    
        By default, all communication is in bytes, and therefore any "input" should
        be bytes, and the stdout and stderr will be bytes. If in text mode, any
        "input" should be a string, and stdout and stderr will be strings decoded
        according to locale encoding, or by "encoding" if set. Text mode is
        triggered by setting any of text, encoding, errors or universal_newlines.
    
        The other arguments are the same as for the Popen constructor.
        """
        if input is not None:
            if kwargs.get('stdin') is not None:
                raise ValueError('stdin and input arguments may not both be used.')
            kwargs['stdin'] = PIPE
    
        if capture_output:
            if kwargs.get('stdout') is not None or kwargs.get('stderr') is not None:
                raise ValueError('stdout and stderr arguments may not be used '
                                 'with capture_output.')
            kwargs['stdout'] = PIPE
            kwargs['stderr'] = PIPE
    
>       with Popen(*popenargs, **kwargs) as process:
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:548: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_h60b0wz6/rsa.key', '2048']
bufsize = -1, executable = None, stdin = None, stdout = -1, stderr = -1
preexec_fn = None, close_fds = True, shell = False, cwd = None, env = None
universal_newlines = None, startupinfo = None, creationflags = 0
restore_signals = True, start_new_session = False, pass_fds = ()

    def __init__(self, args, bufsize=-1, executable=None,
                 stdin=None, stdout=None, stderr=None,
                 preexec_fn=None, close_fds=True,
                 shell=False, cwd=None, env=None, universal_newlines=None,
                 startupinfo=None, creationflags=0,
                 restore_signals=True, start_new_session=False,
                 pass_fds=(), *, user=None, group=None, extra_groups=None,
                 encoding=None, errors=None, text=None, umask=-1, pipesize=-1,
                 process_group=None):
        """Create new Popen instance."""
        if not _can_fork_exec:
            raise OSError(
                errno.ENOTSUP, f"{sys.platform} does not support processes."
            )
    
        _cleanup()
        # Held while anything is calling waitpid before returncode has been
        # updated to prevent clobbering returncode if wait() or poll() are
        # called from multiple threads at once.  After acquiring the lock,
        # code must re-check self.returncode to see if another thread just
        # finished a waitpid() call.
        self._waitpid_lock = threading.Lock()
    
        self._input = None
        self._communication_started = False
        if bufsize is None:
            bufsize = -1  # Restore default
        if not isinstance(bufsize, int):
            raise TypeError("bufsize must be an integer")
    
        if pipesize is None:
            pipesize = -1  # Restore default
        if not isinstance(pipesize, int):
            raise TypeError("pipesize must be an integer")
    
        if _mswindows:
            if preexec_fn is not None:
                raise ValueError("preexec_fn is not supported on Windows "
                                 "platforms")
        else:
            # POSIX
            if pass_fds and not close_fds:
                warnings.warn("pass_fds overriding close_fds.", RuntimeWarning)
                close_fds = True
            if startupinfo is not None:
                raise ValueError("startupinfo is only supported on Windows "
                                 "platforms")
            if creationflags != 0:
                raise ValueError("creationflags is only supported on Windows "
                                 "platforms")
    
        self.args = args
        self.stdin = None
        self.stdout = None
        self.stderr = None
        self.pid = None
        self.returncode = None
        self.encoding = encoding
        self.errors = errors
        self.pipesize = pipesize
    
        # Validate the combinations of text and universal_newlines
        if (text is not None and universal_newlines is not None
            and bool(universal_newlines) != bool(text)):
            raise SubprocessError('Cannot disambiguate when both text '
                                  'and universal_newlines are supplied but '
                                  'different. Pass one or the other.')
    
        self.text_mode = encoding or errors or text or universal_newlines
        if self.text_mode and encoding is None:
            self.encoding = encoding = _text_encoding()
    
        # How long to resume waiting on a child after the first ^C.
        # There is no right value for this.  The purpose is to be polite
        # yet remain good for interactive users trying to exit a tool.
        self._sigint_wait_secs = 0.25  # 1/xkcd221.getRandomNumber()
    
        self._closed_child_pipe_fds = False
    
        if self.text_mode:
            if bufsize == 1:
                line_buffering = True
                # Use the default buffer size for the underlying binary streams
                # since they don't support line buffering.
                bufsize = -1
            else:
                line_buffering = False
    
        if process_group is None:
            process_group = -1  # The internal APIs are int-only
    
        gid = None
        if group is not None:
            if not hasattr(os, 'setregid'):
                raise ValueError("The 'group' parameter is not supported on the "
                                 "current platform")
    
            elif isinstance(group, str):
                try:
                    import grp
                except ImportError:
                    raise ValueError("The group parameter cannot be a string "
                                     "on systems without the grp module")
    
                gid = grp.getgrnam(group).gr_gid
            elif isinstance(group, int):
                gid = group
            else:
                raise TypeError("Group must be a string or an integer, not {}"
                                .format(type(group)))
    
            if gid < 0:
                raise ValueError(f"Group ID cannot be negative, got {gid}")
    
        gids = None
        if extra_groups is not None:
            if not hasattr(os, 'setgroups'):
                raise ValueError("The 'extra_groups' parameter is not "
                                 "supported on the current platform")
    
            elif isinstance(extra_groups, str):
                raise ValueError("Groups must be a list, not a string")
    
            gids = []
            for extra_group in extra_groups:
                if isinstance(extra_group, str):
                    try:
                        import grp
                    except ImportError:
                        raise ValueError("Items in extra_groups cannot be "
                                         "strings on systems without the "
                                         "grp module")
    
                    gids.append(grp.getgrnam(extra_group).gr_gid)
                elif isinstance(extra_group, int):
                    gids.append(extra_group)
                else:
                    raise TypeError("Items in extra_groups must be a string "
                                    "or integer, not {}"
                                    .format(type(extra_group)))
    
            # make sure that the gids are all positive here so we can do less
            # checking in the C code
            for gid_check in gids:
                if gid_check < 0:
                    raise ValueError(f"Group ID cannot be negative, got {gid_check}")
    
        uid = None
        if user is not None:
            if not hasattr(os, 'setreuid'):
                raise ValueError("The 'user' parameter is not supported on "
                                 "the current platform")
    
            elif isinstance(user, str):
                try:
                    import pwd
                except ImportError:
                    raise ValueError("The user parameter cannot be a string "
                                     "on systems without the pwd module")
                uid = pwd.getpwnam(user).pw_uid
            elif isinstance(user, int):
                uid = user
            else:
                raise TypeError("User must be a string or an integer")
    
            if uid < 0:
                raise ValueError(f"User ID cannot be negative, got {uid}")
    
        # Input and output objects. The general principle is like
        # this:
        #
        # Parent                   Child
        # ------                   -----
        # p2cwrite   ---stdin--->  p2cread
        # c2pread    <--stdout---  c2pwrite
        # errread    <--stderr---  errwrite
        #
        # On POSIX, the child objects are file descriptors.  On
        # Windows, these are Windows file handles.  The parent objects
        # are file descriptors on both platforms.  The parent objects
        # are -1 when not using PIPEs. The child objects are -1
        # when not redirecting.
    
        (p2cread, p2cwrite,
         c2pread, c2pwrite,
         errread, errwrite) = self._get_handles(stdin, stdout, stderr)
    
        # From here on, raising exceptions may cause file descriptor leakage
    
        # We wrap OS handles *before* launching the child, otherwise a
        # quickly terminating child could make our fds unwrappable
        # (see #8458).
    
        if _mswindows:
            if p2cwrite != -1:
                p2cwrite = msvcrt.open_osfhandle(p2cwrite.Detach(), 0)
            if c2pread != -1:
                c2pread = msvcrt.open_osfhandle(c2pread.Detach(), 0)
            if errread != -1:
                errread = msvcrt.open_osfhandle(errread.Detach(), 0)
    
        try:
            if p2cwrite != -1:
                self.stdin = io.open(p2cwrite, 'wb', bufsize)
                if self.text_mode:
                    self.stdin = io.TextIOWrapper(self.stdin, write_through=True,
                            line_buffering=line_buffering,
                            encoding=encoding, errors=errors)
            if c2pread != -1:
                self.stdout = io.open(c2pread, 'rb', bufsize)
                if self.text_mode:
                    self.stdout = io.TextIOWrapper(self.stdout,
                            encoding=encoding, errors=errors)
            if errread != -1:
                self.stderr = io.open(errread, 'rb', bufsize)
                if self.text_mode:
                    self.stderr = io.TextIOWrapper(self.stderr,
                            encoding=encoding, errors=errors)
    
>           self._execute_child(args, executable, preexec_fn, close_fds,
                                pass_fds, cwd, env,
                                startupinfo, creationflags, shell,
                                p2cread, p2cwrite,
                                c2pread, c2pwrite,
                                errread, errwrite,
                                restore_signals,
                                gid, gids, uid, umask,
                                start_new_session, process_group)

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1026: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_h60b0wz6/rsa.key', '2048']
executable = None, preexec_fn = None, close_fds = True, pass_fds = ()
cwd = None, env = None, startupinfo = None, creationflags = 0, shell = False
p2cread = -1, p2cwrite = -1, c2pread = 14, c2pwrite = 15, errread = 16
errwrite = 17, restore_signals = True, gid = None, gids = None, uid = None
umask = -1, start_new_session = False, process_group = -1

    def _execute_child(self, args, executable, preexec_fn, close_fds,
                       pass_fds, cwd, env,
                       startupinfo, creationflags, shell,
                       p2cread, p2cwrite,
                       c2pread, c2pwrite,
                       errread, errwrite,
                       restore_signals,
                       gid, gids, uid, umask,
                       start_new_session, process_group):
        """Execute program (POSIX version)"""
    
        if isinstance(args, (str, bytes)):
            args = [args]
        elif isinstance(args, os.PathLike):
            if shell:
                raise TypeError('path-like args is not allowed when '
                                'shell is true')
            args = [args]
        else:
            args = list(args)
    
        if shell:
            # On Android the default shell is at '/system/bin/sh'.
            unix_shell = ('/system/bin/sh' if
                      hasattr(sys, 'getandroidapilevel') else '/bin/sh')
            args = [unix_shell, "-c"] + args
            if executable:
                args[0] = executable
    
        if executable is None:
            executable = args[0]
    
        sys.audit("subprocess.Popen", executable, args, cwd, env)
    
        if (_USE_POSIX_SPAWN
>               and os.path.dirname(executable)
                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^
                and preexec_fn is None
                and not close_fds
                and not pass_fds
                and cwd is None
                and (p2cread == -1 or p2cread > 2)
                and (c2pwrite == -1 or c2pwrite > 2)
                and (errwrite == -1 or errwrite > 2)
                and not start_new_session
                and process_group == -1
                and gid is None
                and gids is None
                and uid is None
                and umask < 0):

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1826: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

p = None

>   ???
E   TypeError: expected str, bytes or os.PathLike object, not NoneType

<frozen posixpath>:152: TypeError
_______ TestGenerateLocalServerCert.test_empty_dns_still_gets_edge_local _______

self = <tests.test_ssl_reserved_sni.TestGenerateLocalServerCert object at 0x10851d450>
test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10bc9fe90>

    async def test_empty_dns_still_gets_edge_local(self, test_db):
>       ca_id = await _create_ca(test_db, "rsa")
                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

tests/test_ssl_reserved_sni.py:199: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10bc9fe90>
algorithm = 'rsa'

    async def _create_ca(test_db, algorithm: str = "rsa") -> int:
        """Create a real CA record in test_db, return its id."""
        from app.services.cert_generator import generate_ca_certificate, detect_openssl
    
        info = detect_openssl()
        if algorithm == "sm2" and not info["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
>       result, _ = generate_ca_certificate(
            openssl_path=info["path"],
            common_name=f"Test CA {algorithm}",
            validity_days=3650,
            flavor=info["flavor"],
            algorithm=algorithm,
        )

tests/test_ssl_reserved_sni.py:47: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None, common_name = 'Test CA rsa', validity_days = 3650
flavor = 'unknown', algorithm = 'rsa', org = 'EMBRACE', ou = 'EDGE'

    def generate_ca_certificate(
        openssl_path: str,
        common_name: str,
        validity_days: int,
        flavor: str,
        algorithm: str = "sm2",
        org: str = "EMBRACE",
        ou: str = "EDGE",
    ) -> tuple[dict, list[CommandResult]]:
        """Generate a self-signed CA root certificate.
    
        Supports sm2, rsa, and ecc algorithms.
    
        Returns (result_dict, logs) where result_dict has keys: ca_cert, ca_key.
        """
        logs: list[CommandResult] = []
    
        hash_alg = "sm3" if algorithm == "sm2" else "sha256"
    
        if algorithm == "sm2":
            ca_key, key_logs = generate_sm2_keypair(openssl_path)
        elif algorithm == "rsa":
>           ca_key, key_logs = generate_rsa_keypair(openssl_path)
                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

app/services/cert_generator.py:435: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None

    def generate_rsa_keypair(openssl_path: str) -> tuple[str, list[CommandResult]]:
        """Generate an RSA 2048-bit key pair. Returns (private_key_pem, logs)."""
        with tempfile.TemporaryDirectory(prefix="panshi_rsa_") as tmpdir:
            key_file = Path(tmpdir) / "rsa.key"
>           result = _run_openssl(
                ["genrsa", "-out", str(key_file), "2048"],
                openssl_path,
            )

app/services/cert_generator.py:181: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

cmd = ['genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_frytn_0m/rsa.key', '2048']
openssl_path = None

    def _run_openssl(cmd: list[str], openssl_path: str) -> CommandResult:
        """Run an openssl command and return the result with command info."""
        full_cmd = [openssl_path] + cmd
>       result = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )

app/services/cert_generator.py:69: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

input = None, capture_output = True, timeout = 30, check = False
popenargs = ([None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_frytn_0m/rsa.key', '2048'],)
kwargs = {'stderr': -1, 'stdout': -1, 'text': True}

    def run(*popenargs,
            input=None, capture_output=False, timeout=None, check=False, **kwargs):
        """Run command with arguments and return a CompletedProcess instance.
    
        The returned instance will have attributes args, returncode, stdout and
        stderr. By default, stdout and stderr are not captured, and those attributes
        will be None. Pass stdout=PIPE and/or stderr=PIPE in order to capture them,
        or pass capture_output=True to capture both.
    
        If check is True and the exit code was non-zero, it raises a
        CalledProcessError. The CalledProcessError object will have the return code
        in the returncode attribute, and output & stderr attributes if those streams
        were captured.
    
        If timeout is given, and the process takes too long, a TimeoutExpired
        exception will be raised.
    
        There is an optional argument "input", allowing you to
        pass bytes or a string to the subprocess's stdin.  If you use this argument
        you may not also use the Popen constructor's "stdin" argument, as
        it will be used internally.
    
        By default, all communication is in bytes, and therefore any "input" should
        be bytes, and the stdout and stderr will be bytes. If in text mode, any
        "input" should be a string, and stdout and stderr will be strings decoded
        according to locale encoding, or by "encoding" if set. Text mode is
        triggered by setting any of text, encoding, errors or universal_newlines.
    
        The other arguments are the same as for the Popen constructor.
        """
        if input is not None:
            if kwargs.get('stdin') is not None:
                raise ValueError('stdin and input arguments may not both be used.')
            kwargs['stdin'] = PIPE
    
        if capture_output:
            if kwargs.get('stdout') is not None or kwargs.get('stderr') is not None:
                raise ValueError('stdout and stderr arguments may not be used '
                                 'with capture_output.')
            kwargs['stdout'] = PIPE
            kwargs['stderr'] = PIPE
    
>       with Popen(*popenargs, **kwargs) as process:
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:548: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_frytn_0m/rsa.key', '2048']
bufsize = -1, executable = None, stdin = None, stdout = -1, stderr = -1
preexec_fn = None, close_fds = True, shell = False, cwd = None, env = None
universal_newlines = None, startupinfo = None, creationflags = 0
restore_signals = True, start_new_session = False, pass_fds = ()

    def __init__(self, args, bufsize=-1, executable=None,
                 stdin=None, stdout=None, stderr=None,
                 preexec_fn=None, close_fds=True,
                 shell=False, cwd=None, env=None, universal_newlines=None,
                 startupinfo=None, creationflags=0,
                 restore_signals=True, start_new_session=False,
                 pass_fds=(), *, user=None, group=None, extra_groups=None,
                 encoding=None, errors=None, text=None, umask=-1, pipesize=-1,
                 process_group=None):
        """Create new Popen instance."""
        if not _can_fork_exec:
            raise OSError(
                errno.ENOTSUP, f"{sys.platform} does not support processes."
            )
    
        _cleanup()
        # Held while anything is calling waitpid before returncode has been
        # updated to prevent clobbering returncode if wait() or poll() are
        # called from multiple threads at once.  After acquiring the lock,
        # code must re-check self.returncode to see if another thread just
        # finished a waitpid() call.
        self._waitpid_lock = threading.Lock()
    
        self._input = None
        self._communication_started = False
        if bufsize is None:
            bufsize = -1  # Restore default
        if not isinstance(bufsize, int):
            raise TypeError("bufsize must be an integer")
    
        if pipesize is None:
            pipesize = -1  # Restore default
        if not isinstance(pipesize, int):
            raise TypeError("pipesize must be an integer")
    
        if _mswindows:
            if preexec_fn is not None:
                raise ValueError("preexec_fn is not supported on Windows "
                                 "platforms")
        else:
            # POSIX
            if pass_fds and not close_fds:
                warnings.warn("pass_fds overriding close_fds.", RuntimeWarning)
                close_fds = True
            if startupinfo is not None:
                raise ValueError("startupinfo is only supported on Windows "
                                 "platforms")
            if creationflags != 0:
                raise ValueError("creationflags is only supported on Windows "
                                 "platforms")
    
        self.args = args
        self.stdin = None
        self.stdout = None
        self.stderr = None
        self.pid = None
        self.returncode = None
        self.encoding = encoding
        self.errors = errors
        self.pipesize = pipesize
    
        # Validate the combinations of text and universal_newlines
        if (text is not None and universal_newlines is not None
            and bool(universal_newlines) != bool(text)):
            raise SubprocessError('Cannot disambiguate when both text '
                                  'and universal_newlines are supplied but '
                                  'different. Pass one or the other.')
    
        self.text_mode = encoding or errors or text or universal_newlines
        if self.text_mode and encoding is None:
            self.encoding = encoding = _text_encoding()
    
        # How long to resume waiting on a child after the first ^C.
        # There is no right value for this.  The purpose is to be polite
        # yet remain good for interactive users trying to exit a tool.
        self._sigint_wait_secs = 0.25  # 1/xkcd221.getRandomNumber()
    
        self._closed_child_pipe_fds = False
    
        if self.text_mode:
            if bufsize == 1:
                line_buffering = True
                # Use the default buffer size for the underlying binary streams
                # since they don't support line buffering.
                bufsize = -1
            else:
                line_buffering = False
    
        if process_group is None:
            process_group = -1  # The internal APIs are int-only
    
        gid = None
        if group is not None:
            if not hasattr(os, 'setregid'):
                raise ValueError("The 'group' parameter is not supported on the "
                                 "current platform")
    
            elif isinstance(group, str):
                try:
                    import grp
                except ImportError:
                    raise ValueError("The group parameter cannot be a string "
                                     "on systems without the grp module")
    
                gid = grp.getgrnam(group).gr_gid
            elif isinstance(group, int):
                gid = group
            else:
                raise TypeError("Group must be a string or an integer, not {}"
                                .format(type(group)))
    
            if gid < 0:
                raise ValueError(f"Group ID cannot be negative, got {gid}")
    
        gids = None
        if extra_groups is not None:
            if not hasattr(os, 'setgroups'):
                raise ValueError("The 'extra_groups' parameter is not "
                                 "supported on the current platform")
    
            elif isinstance(extra_groups, str):
                raise ValueError("Groups must be a list, not a string")
    
            gids = []
            for extra_group in extra_groups:
                if isinstance(extra_group, str):
                    try:
                        import grp
                    except ImportError:
                        raise ValueError("Items in extra_groups cannot be "
                                         "strings on systems without the "
                                         "grp module")
    
                    gids.append(grp.getgrnam(extra_group).gr_gid)
                elif isinstance(extra_group, int):
                    gids.append(extra_group)
                else:
                    raise TypeError("Items in extra_groups must be a string "
                                    "or integer, not {}"
                                    .format(type(extra_group)))
    
            # make sure that the gids are all positive here so we can do less
            # checking in the C code
            for gid_check in gids:
                if gid_check < 0:
                    raise ValueError(f"Group ID cannot be negative, got {gid_check}")
    
        uid = None
        if user is not None:
            if not hasattr(os, 'setreuid'):
                raise ValueError("The 'user' parameter is not supported on "
                                 "the current platform")
    
            elif isinstance(user, str):
                try:
                    import pwd
                except ImportError:
                    raise ValueError("The user parameter cannot be a string "
                                     "on systems without the pwd module")
                uid = pwd.getpwnam(user).pw_uid
            elif isinstance(user, int):
                uid = user
            else:
                raise TypeError("User must be a string or an integer")
    
            if uid < 0:
                raise ValueError(f"User ID cannot be negative, got {uid}")
    
        # Input and output objects. The general principle is like
        # this:
        #
        # Parent                   Child
        # ------                   -----
        # p2cwrite   ---stdin--->  p2cread
        # c2pread    <--stdout---  c2pwrite
        # errread    <--stderr---  errwrite
        #
        # On POSIX, the child objects are file descriptors.  On
        # Windows, these are Windows file handles.  The parent objects
        # are file descriptors on both platforms.  The parent objects
        # are -1 when not using PIPEs. The child objects are -1
        # when not redirecting.
    
        (p2cread, p2cwrite,
         c2pread, c2pwrite,
         errread, errwrite) = self._get_handles(stdin, stdout, stderr)
    
        # From here on, raising exceptions may cause file descriptor leakage
    
        # We wrap OS handles *before* launching the child, otherwise a
        # quickly terminating child could make our fds unwrappable
        # (see #8458).
    
        if _mswindows:
            if p2cwrite != -1:
                p2cwrite = msvcrt.open_osfhandle(p2cwrite.Detach(), 0)
            if c2pread != -1:
                c2pread = msvcrt.open_osfhandle(c2pread.Detach(), 0)
            if errread != -1:
                errread = msvcrt.open_osfhandle(errread.Detach(), 0)
    
        try:
            if p2cwrite != -1:
                self.stdin = io.open(p2cwrite, 'wb', bufsize)
                if self.text_mode:
                    self.stdin = io.TextIOWrapper(self.stdin, write_through=True,
                            line_buffering=line_buffering,
                            encoding=encoding, errors=errors)
            if c2pread != -1:
                self.stdout = io.open(c2pread, 'rb', bufsize)
                if self.text_mode:
                    self.stdout = io.TextIOWrapper(self.stdout,
                            encoding=encoding, errors=errors)
            if errread != -1:
                self.stderr = io.open(errread, 'rb', bufsize)
                if self.text_mode:
                    self.stderr = io.TextIOWrapper(self.stderr,
                            encoding=encoding, errors=errors)
    
>           self._execute_child(args, executable, preexec_fn, close_fds,
                                pass_fds, cwd, env,
                                startupinfo, creationflags, shell,
                                p2cread, p2cwrite,
                                c2pread, c2pwrite,
                                errread, errwrite,
                                restore_signals,
                                gid, gids, uid, umask,
                                start_new_session, process_group)

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1026: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_frytn_0m/rsa.key', '2048']
executable = None, preexec_fn = None, close_fds = True, pass_fds = ()
cwd = None, env = None, startupinfo = None, creationflags = 0, shell = False
p2cread = -1, p2cwrite = -1, c2pread = 14, c2pwrite = 15, errread = 16
errwrite = 17, restore_signals = True, gid = None, gids = None, uid = None
umask = -1, start_new_session = False, process_group = -1

    def _execute_child(self, args, executable, preexec_fn, close_fds,
                       pass_fds, cwd, env,
                       startupinfo, creationflags, shell,
                       p2cread, p2cwrite,
                       c2pread, c2pwrite,
                       errread, errwrite,
                       restore_signals,
                       gid, gids, uid, umask,
                       start_new_session, process_group):
        """Execute program (POSIX version)"""
    
        if isinstance(args, (str, bytes)):
            args = [args]
        elif isinstance(args, os.PathLike):
            if shell:
                raise TypeError('path-like args is not allowed when '
                                'shell is true')
            args = [args]
        else:
            args = list(args)
    
        if shell:
            # On Android the default shell is at '/system/bin/sh'.
            unix_shell = ('/system/bin/sh' if
                      hasattr(sys, 'getandroidapilevel') else '/bin/sh')
            args = [unix_shell, "-c"] + args
            if executable:
                args[0] = executable
    
        if executable is None:
            executable = args[0]
    
        sys.audit("subprocess.Popen", executable, args, cwd, env)
    
        if (_USE_POSIX_SPAWN
>               and os.path.dirname(executable)
                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^
                and preexec_fn is None
                and not close_fds
                and not pass_fds
                and cwd is None
                and (p2cread == -1 or p2cread > 2)
                and (c2pwrite == -1 or c2pwrite > 2)
                and (errwrite == -1 or errwrite > 2)
                and not start_new_session
                and process_group == -1
                and gid is None
                and gids is None
                and uid is None
                and umask < 0):

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1826: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

p = None

>   ???
E   TypeError: expected str, bytes or os.PathLike object, not NoneType

<frozen posixpath>:152: TypeError
____ TestGenerateLocalServerCert.test_user_dns_case_normalized_and_deduped _____

self = <tests.test_ssl_reserved_sni.TestGenerateLocalServerCert object at 0x108517690>
test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10ba8c050>

    async def test_user_dns_case_normalized_and_deduped(self, test_db):
>       ca_id = await _create_ca(test_db, "rsa")
                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

tests/test_ssl_reserved_sni.py:208: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10ba8c050>
algorithm = 'rsa'

    async def _create_ca(test_db, algorithm: str = "rsa") -> int:
        """Create a real CA record in test_db, return its id."""
        from app.services.cert_generator import generate_ca_certificate, detect_openssl
    
        info = detect_openssl()
        if algorithm == "sm2" and not info["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
>       result, _ = generate_ca_certificate(
            openssl_path=info["path"],
            common_name=f"Test CA {algorithm}",
            validity_days=3650,
            flavor=info["flavor"],
            algorithm=algorithm,
        )

tests/test_ssl_reserved_sni.py:47: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None, common_name = 'Test CA rsa', validity_days = 3650
flavor = 'unknown', algorithm = 'rsa', org = 'EMBRACE', ou = 'EDGE'

    def generate_ca_certificate(
        openssl_path: str,
        common_name: str,
        validity_days: int,
        flavor: str,
        algorithm: str = "sm2",
        org: str = "EMBRACE",
        ou: str = "EDGE",
    ) -> tuple[dict, list[CommandResult]]:
        """Generate a self-signed CA root certificate.
    
        Supports sm2, rsa, and ecc algorithms.
    
        Returns (result_dict, logs) where result_dict has keys: ca_cert, ca_key.
        """
        logs: list[CommandResult] = []
    
        hash_alg = "sm3" if algorithm == "sm2" else "sha256"
    
        if algorithm == "sm2":
            ca_key, key_logs = generate_sm2_keypair(openssl_path)
        elif algorithm == "rsa":
>           ca_key, key_logs = generate_rsa_keypair(openssl_path)
                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

app/services/cert_generator.py:435: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None

    def generate_rsa_keypair(openssl_path: str) -> tuple[str, list[CommandResult]]:
        """Generate an RSA 2048-bit key pair. Returns (private_key_pem, logs)."""
        with tempfile.TemporaryDirectory(prefix="panshi_rsa_") as tmpdir:
            key_file = Path(tmpdir) / "rsa.key"
>           result = _run_openssl(
                ["genrsa", "-out", str(key_file), "2048"],
                openssl_path,
            )

app/services/cert_generator.py:181: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

cmd = ['genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_tvt9tzor/rsa.key', '2048']
openssl_path = None

    def _run_openssl(cmd: list[str], openssl_path: str) -> CommandResult:
        """Run an openssl command and return the result with command info."""
        full_cmd = [openssl_path] + cmd
>       result = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )

app/services/cert_generator.py:69: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

input = None, capture_output = True, timeout = 30, check = False
popenargs = ([None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_tvt9tzor/rsa.key', '2048'],)
kwargs = {'stderr': -1, 'stdout': -1, 'text': True}

    def run(*popenargs,
            input=None, capture_output=False, timeout=None, check=False, **kwargs):
        """Run command with arguments and return a CompletedProcess instance.
    
        The returned instance will have attributes args, returncode, stdout and
        stderr. By default, stdout and stderr are not captured, and those attributes
        will be None. Pass stdout=PIPE and/or stderr=PIPE in order to capture them,
        or pass capture_output=True to capture both.
    
        If check is True and the exit code was non-zero, it raises a
        CalledProcessError. The CalledProcessError object will have the return code
        in the returncode attribute, and output & stderr attributes if those streams
        were captured.
    
        If timeout is given, and the process takes too long, a TimeoutExpired
        exception will be raised.
    
        There is an optional argument "input", allowing you to
        pass bytes or a string to the subprocess's stdin.  If you use this argument
        you may not also use the Popen constructor's "stdin" argument, as
        it will be used internally.
    
        By default, all communication is in bytes, and therefore any "input" should
        be bytes, and the stdout and stderr will be bytes. If in text mode, any
        "input" should be a string, and stdout and stderr will be strings decoded
        according to locale encoding, or by "encoding" if set. Text mode is
        triggered by setting any of text, encoding, errors or universal_newlines.
    
        The other arguments are the same as for the Popen constructor.
        """
        if input is not None:
            if kwargs.get('stdin') is not None:
                raise ValueError('stdin and input arguments may not both be used.')
            kwargs['stdin'] = PIPE
    
        if capture_output:
            if kwargs.get('stdout') is not None or kwargs.get('stderr') is not None:
                raise ValueError('stdout and stderr arguments may not be used '
                                 'with capture_output.')
            kwargs['stdout'] = PIPE
            kwargs['stderr'] = PIPE
    
>       with Popen(*popenargs, **kwargs) as process:
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:548: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_tvt9tzor/rsa.key', '2048']
bufsize = -1, executable = None, stdin = None, stdout = -1, stderr = -1
preexec_fn = None, close_fds = True, shell = False, cwd = None, env = None
universal_newlines = None, startupinfo = None, creationflags = 0
restore_signals = True, start_new_session = False, pass_fds = ()

    def __init__(self, args, bufsize=-1, executable=None,
                 stdin=None, stdout=None, stderr=None,
                 preexec_fn=None, close_fds=True,
                 shell=False, cwd=None, env=None, universal_newlines=None,
                 startupinfo=None, creationflags=0,
                 restore_signals=True, start_new_session=False,
                 pass_fds=(), *, user=None, group=None, extra_groups=None,
                 encoding=None, errors=None, text=None, umask=-1, pipesize=-1,
                 process_group=None):
        """Create new Popen instance."""
        if not _can_fork_exec:
            raise OSError(
                errno.ENOTSUP, f"{sys.platform} does not support processes."
            )
    
        _cleanup()
        # Held while anything is calling waitpid before returncode has been
        # updated to prevent clobbering returncode if wait() or poll() are
        # called from multiple threads at once.  After acquiring the lock,
        # code must re-check self.returncode to see if another thread just
        # finished a waitpid() call.
        self._waitpid_lock = threading.Lock()
    
        self._input = None
        self._communication_started = False
        if bufsize is None:
            bufsize = -1  # Restore default
        if not isinstance(bufsize, int):
            raise TypeError("bufsize must be an integer")
    
        if pipesize is None:
            pipesize = -1  # Restore default
        if not isinstance(pipesize, int):
            raise TypeError("pipesize must be an integer")
    
        if _mswindows:
            if preexec_fn is not None:
                raise ValueError("preexec_fn is not supported on Windows "
                                 "platforms")
        else:
            # POSIX
            if pass_fds and not close_fds:
                warnings.warn("pass_fds overriding close_fds.", RuntimeWarning)
                close_fds = True
            if startupinfo is not None:
                raise ValueError("startupinfo is only supported on Windows "
                                 "platforms")
            if creationflags != 0:
                raise ValueError("creationflags is only supported on Windows "
                                 "platforms")
    
        self.args = args
        self.stdin = None
        self.stdout = None
        self.stderr = None
        self.pid = None
        self.returncode = None
        self.encoding = encoding
        self.errors = errors
        self.pipesize = pipesize
    
        # Validate the combinations of text and universal_newlines
        if (text is not None and universal_newlines is not None
            and bool(universal_newlines) != bool(text)):
            raise SubprocessError('Cannot disambiguate when both text '
                                  'and universal_newlines are supplied but '
                                  'different. Pass one or the other.')
    
        self.text_mode = encoding or errors or text or universal_newlines
        if self.text_mode and encoding is None:
            self.encoding = encoding = _text_encoding()
    
        # How long to resume waiting on a child after the first ^C.
        # There is no right value for this.  The purpose is to be polite
        # yet remain good for interactive users trying to exit a tool.
        self._sigint_wait_secs = 0.25  # 1/xkcd221.getRandomNumber()
    
        self._closed_child_pipe_fds = False
    
        if self.text_mode:
            if bufsize == 1:
                line_buffering = True
                # Use the default buffer size for the underlying binary streams
                # since they don't support line buffering.
                bufsize = -1
            else:
                line_buffering = False
    
        if process_group is None:
            process_group = -1  # The internal APIs are int-only
    
        gid = None
        if group is not None:
            if not hasattr(os, 'setregid'):
                raise ValueError("The 'group' parameter is not supported on the "
                                 "current platform")
    
            elif isinstance(group, str):
                try:
                    import grp
                except ImportError:
                    raise ValueError("The group parameter cannot be a string "
                                     "on systems without the grp module")
    
                gid = grp.getgrnam(group).gr_gid
            elif isinstance(group, int):
                gid = group
            else:
                raise TypeError("Group must be a string or an integer, not {}"
                                .format(type(group)))
    
            if gid < 0:
                raise ValueError(f"Group ID cannot be negative, got {gid}")
    
        gids = None
        if extra_groups is not None:
            if not hasattr(os, 'setgroups'):
                raise ValueError("The 'extra_groups' parameter is not "
                                 "supported on the current platform")
    
            elif isinstance(extra_groups, str):
                raise ValueError("Groups must be a list, not a string")
    
            gids = []
            for extra_group in extra_groups:
                if isinstance(extra_group, str):
                    try:
                        import grp
                    except ImportError:
                        raise ValueError("Items in extra_groups cannot be "
                                         "strings on systems without the "
                                         "grp module")
    
                    gids.append(grp.getgrnam(extra_group).gr_gid)
                elif isinstance(extra_group, int):
                    gids.append(extra_group)
                else:
                    raise TypeError("Items in extra_groups must be a string "
                                    "or integer, not {}"
                                    .format(type(extra_group)))
    
            # make sure that the gids are all positive here so we can do less
            # checking in the C code
            for gid_check in gids:
                if gid_check < 0:
                    raise ValueError(f"Group ID cannot be negative, got {gid_check}")
    
        uid = None
        if user is not None:
            if not hasattr(os, 'setreuid'):
                raise ValueError("The 'user' parameter is not supported on "
                                 "the current platform")
    
            elif isinstance(user, str):
                try:
                    import pwd
                except ImportError:
                    raise ValueError("The user parameter cannot be a string "
                                     "on systems without the pwd module")
                uid = pwd.getpwnam(user).pw_uid
            elif isinstance(user, int):
                uid = user
            else:
                raise TypeError("User must be a string or an integer")
    
            if uid < 0:
                raise ValueError(f"User ID cannot be negative, got {uid}")
    
        # Input and output objects. The general principle is like
        # this:
        #
        # Parent                   Child
        # ------                   -----
        # p2cwrite   ---stdin--->  p2cread
        # c2pread    <--stdout---  c2pwrite
        # errread    <--stderr---  errwrite
        #
        # On POSIX, the child objects are file descriptors.  On
        # Windows, these are Windows file handles.  The parent objects
        # are file descriptors on both platforms.  The parent objects
        # are -1 when not using PIPEs. The child objects are -1
        # when not redirecting.
    
        (p2cread, p2cwrite,
         c2pread, c2pwrite,
         errread, errwrite) = self._get_handles(stdin, stdout, stderr)
    
        # From here on, raising exceptions may cause file descriptor leakage
    
        # We wrap OS handles *before* launching the child, otherwise a
        # quickly terminating child could make our fds unwrappable
        # (see #8458).
    
        if _mswindows:
            if p2cwrite != -1:
                p2cwrite = msvcrt.open_osfhandle(p2cwrite.Detach(), 0)
            if c2pread != -1:
                c2pread = msvcrt.open_osfhandle(c2pread.Detach(), 0)
            if errread != -1:
                errread = msvcrt.open_osfhandle(errread.Detach(), 0)
    
        try:
            if p2cwrite != -1:
                self.stdin = io.open(p2cwrite, 'wb', bufsize)
                if self.text_mode:
                    self.stdin = io.TextIOWrapper(self.stdin, write_through=True,
                            line_buffering=line_buffering,
                            encoding=encoding, errors=errors)
            if c2pread != -1:
                self.stdout = io.open(c2pread, 'rb', bufsize)
                if self.text_mode:
                    self.stdout = io.TextIOWrapper(self.stdout,
                            encoding=encoding, errors=errors)
            if errread != -1:
                self.stderr = io.open(errread, 'rb', bufsize)
                if self.text_mode:
                    self.stderr = io.TextIOWrapper(self.stderr,
                            encoding=encoding, errors=errors)
    
>           self._execute_child(args, executable, preexec_fn, close_fds,
                                pass_fds, cwd, env,
                                startupinfo, creationflags, shell,
                                p2cread, p2cwrite,
                                c2pread, c2pwrite,
                                errread, errwrite,
                                restore_signals,
                                gid, gids, uid, umask,
                                start_new_session, process_group)

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1026: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_tvt9tzor/rsa.key', '2048']
executable = None, preexec_fn = None, close_fds = True, pass_fds = ()
cwd = None, env = None, startupinfo = None, creationflags = 0, shell = False
p2cread = -1, p2cwrite = -1, c2pread = 14, c2pwrite = 15, errread = 16
errwrite = 17, restore_signals = True, gid = None, gids = None, uid = None
umask = -1, start_new_session = False, process_group = -1

    def _execute_child(self, args, executable, preexec_fn, close_fds,
                       pass_fds, cwd, env,
                       startupinfo, creationflags, shell,
                       p2cread, p2cwrite,
                       c2pread, c2pwrite,
                       errread, errwrite,
                       restore_signals,
                       gid, gids, uid, umask,
                       start_new_session, process_group):
        """Execute program (POSIX version)"""
    
        if isinstance(args, (str, bytes)):
            args = [args]
        elif isinstance(args, os.PathLike):
            if shell:
                raise TypeError('path-like args is not allowed when '
                                'shell is true')
            args = [args]
        else:
            args = list(args)
    
        if shell:
            # On Android the default shell is at '/system/bin/sh'.
            unix_shell = ('/system/bin/sh' if
                      hasattr(sys, 'getandroidapilevel') else '/bin/sh')
            args = [unix_shell, "-c"] + args
            if executable:
                args[0] = executable
    
        if executable is None:
            executable = args[0]
    
        sys.audit("subprocess.Popen", executable, args, cwd, env)
    
        if (_USE_POSIX_SPAWN
>               and os.path.dirname(executable)
                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^
                and preexec_fn is None
                and not close_fds
                and not pass_fds
                and cwd is None
                and (p2cread == -1 or p2cread > 2)
                and (c2pwrite == -1 or c2pwrite > 2)
                and (errwrite == -1 or errwrite > 2)
                and not start_new_session
                and process_group == -1
                and gid is None
                and gids is None
                and uid is None
                and umask < 0):

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1826: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

p = None

>   ???
E   TypeError: expected str, bytes or os.PathLike object, not NoneType

<frozen posixpath>:152: TypeError
_______ TestGenerateLocalServerCert.test_ip_sans_stripped_and_preserved ________

self = <tests.test_ssl_reserved_sni.TestGenerateLocalServerCert object at 0x108514ad0>
test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10bb93050>

    async def test_ip_sans_stripped_and_preserved(self, test_db):
>       ca_id = await _create_ca(test_db, "rsa")
                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

tests/test_ssl_reserved_sni.py:217: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10bb93050>
algorithm = 'rsa'

    async def _create_ca(test_db, algorithm: str = "rsa") -> int:
        """Create a real CA record in test_db, return its id."""
        from app.services.cert_generator import generate_ca_certificate, detect_openssl
    
        info = detect_openssl()
        if algorithm == "sm2" and not info["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
>       result, _ = generate_ca_certificate(
            openssl_path=info["path"],
            common_name=f"Test CA {algorithm}",
            validity_days=3650,
            flavor=info["flavor"],
            algorithm=algorithm,
        )

tests/test_ssl_reserved_sni.py:47: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None, common_name = 'Test CA rsa', validity_days = 3650
flavor = 'unknown', algorithm = 'rsa', org = 'EMBRACE', ou = 'EDGE'

    def generate_ca_certificate(
        openssl_path: str,
        common_name: str,
        validity_days: int,
        flavor: str,
        algorithm: str = "sm2",
        org: str = "EMBRACE",
        ou: str = "EDGE",
    ) -> tuple[dict, list[CommandResult]]:
        """Generate a self-signed CA root certificate.
    
        Supports sm2, rsa, and ecc algorithms.
    
        Returns (result_dict, logs) where result_dict has keys: ca_cert, ca_key.
        """
        logs: list[CommandResult] = []
    
        hash_alg = "sm3" if algorithm == "sm2" else "sha256"
    
        if algorithm == "sm2":
            ca_key, key_logs = generate_sm2_keypair(openssl_path)
        elif algorithm == "rsa":
>           ca_key, key_logs = generate_rsa_keypair(openssl_path)
                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

app/services/cert_generator.py:435: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None

    def generate_rsa_keypair(openssl_path: str) -> tuple[str, list[CommandResult]]:
        """Generate an RSA 2048-bit key pair. Returns (private_key_pem, logs)."""
        with tempfile.TemporaryDirectory(prefix="panshi_rsa_") as tmpdir:
            key_file = Path(tmpdir) / "rsa.key"
>           result = _run_openssl(
                ["genrsa", "-out", str(key_file), "2048"],
                openssl_path,
            )

app/services/cert_generator.py:181: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

cmd = ['genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_jwz6z3rv/rsa.key', '2048']
openssl_path = None

    def _run_openssl(cmd: list[str], openssl_path: str) -> CommandResult:
        """Run an openssl command and return the result with command info."""
        full_cmd = [openssl_path] + cmd
>       result = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )

app/services/cert_generator.py:69: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

input = None, capture_output = True, timeout = 30, check = False
popenargs = ([None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_jwz6z3rv/rsa.key', '2048'],)
kwargs = {'stderr': -1, 'stdout': -1, 'text': True}

    def run(*popenargs,
            input=None, capture_output=False, timeout=None, check=False, **kwargs):
        """Run command with arguments and return a CompletedProcess instance.
    
        The returned instance will have attributes args, returncode, stdout and
        stderr. By default, stdout and stderr are not captured, and those attributes
        will be None. Pass stdout=PIPE and/or stderr=PIPE in order to capture them,
        or pass capture_output=True to capture both.
    
        If check is True and the exit code was non-zero, it raises a
        CalledProcessError. The CalledProcessError object will have the return code
        in the returncode attribute, and output & stderr attributes if those streams
        were captured.
    
        If timeout is given, and the process takes too long, a TimeoutExpired
        exception will be raised.
    
        There is an optional argument "input", allowing you to
        pass bytes or a string to the subprocess's stdin.  If you use this argument
        you may not also use the Popen constructor's "stdin" argument, as
        it will be used internally.
    
        By default, all communication is in bytes, and therefore any "input" should
        be bytes, and the stdout and stderr will be bytes. If in text mode, any
        "input" should be a string, and stdout and stderr will be strings decoded
        according to locale encoding, or by "encoding" if set. Text mode is
        triggered by setting any of text, encoding, errors or universal_newlines.
    
        The other arguments are the same as for the Popen constructor.
        """
        if input is not None:
            if kwargs.get('stdin') is not None:
                raise ValueError('stdin and input arguments may not both be used.')
            kwargs['stdin'] = PIPE
    
        if capture_output:
            if kwargs.get('stdout') is not None or kwargs.get('stderr') is not None:
                raise ValueError('stdout and stderr arguments may not be used '
                                 'with capture_output.')
            kwargs['stdout'] = PIPE
            kwargs['stderr'] = PIPE
    
>       with Popen(*popenargs, **kwargs) as process:
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:548: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_jwz6z3rv/rsa.key', '2048']
bufsize = -1, executable = None, stdin = None, stdout = -1, stderr = -1
preexec_fn = None, close_fds = True, shell = False, cwd = None, env = None
universal_newlines = None, startupinfo = None, creationflags = 0
restore_signals = True, start_new_session = False, pass_fds = ()

    def __init__(self, args, bufsize=-1, executable=None,
                 stdin=None, stdout=None, stderr=None,
                 preexec_fn=None, close_fds=True,
                 shell=False, cwd=None, env=None, universal_newlines=None,
                 startupinfo=None, creationflags=0,
                 restore_signals=True, start_new_session=False,
                 pass_fds=(), *, user=None, group=None, extra_groups=None,
                 encoding=None, errors=None, text=None, umask=-1, pipesize=-1,
                 process_group=None):
        """Create new Popen instance."""
        if not _can_fork_exec:
            raise OSError(
                errno.ENOTSUP, f"{sys.platform} does not support processes."
            )
    
        _cleanup()
        # Held while anything is calling waitpid before returncode has been
        # updated to prevent clobbering returncode if wait() or poll() are
        # called from multiple threads at once.  After acquiring the lock,
        # code must re-check self.returncode to see if another thread just
        # finished a waitpid() call.
        self._waitpid_lock = threading.Lock()
    
        self._input = None
        self._communication_started = False
        if bufsize is None:
            bufsize = -1  # Restore default
        if not isinstance(bufsize, int):
            raise TypeError("bufsize must be an integer")
    
        if pipesize is None:
            pipesize = -1  # Restore default
        if not isinstance(pipesize, int):
            raise TypeError("pipesize must be an integer")
    
        if _mswindows:
            if preexec_fn is not None:
                raise ValueError("preexec_fn is not supported on Windows "
                                 "platforms")
        else:
            # POSIX
            if pass_fds and not close_fds:
                warnings.warn("pass_fds overriding close_fds.", RuntimeWarning)
                close_fds = True
            if startupinfo is not None:
                raise ValueError("startupinfo is only supported on Windows "
                                 "platforms")
            if creationflags != 0:
                raise ValueError("creationflags is only supported on Windows "
                                 "platforms")
    
        self.args = args
        self.stdin = None
        self.stdout = None
        self.stderr = None
        self.pid = None
        self.returncode = None
        self.encoding = encoding
        self.errors = errors
        self.pipesize = pipesize
    
        # Validate the combinations of text and universal_newlines
        if (text is not None and universal_newlines is not None
            and bool(universal_newlines) != bool(text)):
            raise SubprocessError('Cannot disambiguate when both text '
                                  'and universal_newlines are supplied but '
                                  'different. Pass one or the other.')
    
        self.text_mode = encoding or errors or text or universal_newlines
        if self.text_mode and encoding is None:
            self.encoding = encoding = _text_encoding()
    
        # How long to resume waiting on a child after the first ^C.
        # There is no right value for this.  The purpose is to be polite
        # yet remain good for interactive users trying to exit a tool.
        self._sigint_wait_secs = 0.25  # 1/xkcd221.getRandomNumber()
    
        self._closed_child_pipe_fds = False
    
        if self.text_mode:
            if bufsize == 1:
                line_buffering = True
                # Use the default buffer size for the underlying binary streams
                # since they don't support line buffering.
                bufsize = -1
            else:
                line_buffering = False
    
        if process_group is None:
            process_group = -1  # The internal APIs are int-only
    
        gid = None
        if group is not None:
            if not hasattr(os, 'setregid'):
                raise ValueError("The 'group' parameter is not supported on the "
                                 "current platform")
    
            elif isinstance(group, str):
                try:
                    import grp
                except ImportError:
                    raise ValueError("The group parameter cannot be a string "
                                     "on systems without the grp module")
    
                gid = grp.getgrnam(group).gr_gid
            elif isinstance(group, int):
                gid = group
            else:
                raise TypeError("Group must be a string or an integer, not {}"
                                .format(type(group)))
    
            if gid < 0:
                raise ValueError(f"Group ID cannot be negative, got {gid}")
    
        gids = None
        if extra_groups is not None:
            if not hasattr(os, 'setgroups'):
                raise ValueError("The 'extra_groups' parameter is not "
                                 "supported on the current platform")
    
            elif isinstance(extra_groups, str):
                raise ValueError("Groups must be a list, not a string")
    
            gids = []
            for extra_group in extra_groups:
                if isinstance(extra_group, str):
                    try:
                        import grp
                    except ImportError:
                        raise ValueError("Items in extra_groups cannot be "
                                         "strings on systems without the "
                                         "grp module")
    
                    gids.append(grp.getgrnam(extra_group).gr_gid)
                elif isinstance(extra_group, int):
                    gids.append(extra_group)
                else:
                    raise TypeError("Items in extra_groups must be a string "
                                    "or integer, not {}"
                                    .format(type(extra_group)))
    
            # make sure that the gids are all positive here so we can do less
            # checking in the C code
            for gid_check in gids:
                if gid_check < 0:
                    raise ValueError(f"Group ID cannot be negative, got {gid_check}")
    
        uid = None
        if user is not None:
            if not hasattr(os, 'setreuid'):
                raise ValueError("The 'user' parameter is not supported on "
                                 "the current platform")
    
            elif isinstance(user, str):
                try:
                    import pwd
                except ImportError:
                    raise ValueError("The user parameter cannot be a string "
                                     "on systems without the pwd module")
                uid = pwd.getpwnam(user).pw_uid
            elif isinstance(user, int):
                uid = user
            else:
                raise TypeError("User must be a string or an integer")
    
            if uid < 0:
                raise ValueError(f"User ID cannot be negative, got {uid}")
    
        # Input and output objects. The general principle is like
        # this:
        #
        # Parent                   Child
        # ------                   -----
        # p2cwrite   ---stdin--->  p2cread
        # c2pread    <--stdout---  c2pwrite
        # errread    <--stderr---  errwrite
        #
        # On POSIX, the child objects are file descriptors.  On
        # Windows, these are Windows file handles.  The parent objects
        # are file descriptors on both platforms.  The parent objects
        # are -1 when not using PIPEs. The child objects are -1
        # when not redirecting.
    
        (p2cread, p2cwrite,
         c2pread, c2pwrite,
         errread, errwrite) = self._get_handles(stdin, stdout, stderr)
    
        # From here on, raising exceptions may cause file descriptor leakage
    
        # We wrap OS handles *before* launching the child, otherwise a
        # quickly terminating child could make our fds unwrappable
        # (see #8458).
    
        if _mswindows:
            if p2cwrite != -1:
                p2cwrite = msvcrt.open_osfhandle(p2cwrite.Detach(), 0)
            if c2pread != -1:
                c2pread = msvcrt.open_osfhandle(c2pread.Detach(), 0)
            if errread != -1:
                errread = msvcrt.open_osfhandle(errread.Detach(), 0)
    
        try:
            if p2cwrite != -1:
                self.stdin = io.open(p2cwrite, 'wb', bufsize)
                if self.text_mode:
                    self.stdin = io.TextIOWrapper(self.stdin, write_through=True,
                            line_buffering=line_buffering,
                            encoding=encoding, errors=errors)
            if c2pread != -1:
                self.stdout = io.open(c2pread, 'rb', bufsize)
                if self.text_mode:
                    self.stdout = io.TextIOWrapper(self.stdout,
                            encoding=encoding, errors=errors)
            if errread != -1:
                self.stderr = io.open(errread, 'rb', bufsize)
                if self.text_mode:
                    self.stderr = io.TextIOWrapper(self.stderr,
                            encoding=encoding, errors=errors)
    
>           self._execute_child(args, executable, preexec_fn, close_fds,
                                pass_fds, cwd, env,
                                startupinfo, creationflags, shell,
                                p2cread, p2cwrite,
                                c2pread, c2pwrite,
                                errread, errwrite,
                                restore_signals,
                                gid, gids, uid, umask,
                                start_new_session, process_group)

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1026: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_jwz6z3rv/rsa.key', '2048']
executable = None, preexec_fn = None, close_fds = True, pass_fds = ()
cwd = None, env = None, startupinfo = None, creationflags = 0, shell = False
p2cread = -1, p2cwrite = -1, c2pread = 14, c2pwrite = 15, errread = 16
errwrite = 17, restore_signals = True, gid = None, gids = None, uid = None
umask = -1, start_new_session = False, process_group = -1

    def _execute_child(self, args, executable, preexec_fn, close_fds,
                       pass_fds, cwd, env,
                       startupinfo, creationflags, shell,
                       p2cread, p2cwrite,
                       c2pread, c2pwrite,
                       errread, errwrite,
                       restore_signals,
                       gid, gids, uid, umask,
                       start_new_session, process_group):
        """Execute program (POSIX version)"""
    
        if isinstance(args, (str, bytes)):
            args = [args]
        elif isinstance(args, os.PathLike):
            if shell:
                raise TypeError('path-like args is not allowed when '
                                'shell is true')
            args = [args]
        else:
            args = list(args)
    
        if shell:
            # On Android the default shell is at '/system/bin/sh'.
            unix_shell = ('/system/bin/sh' if
                      hasattr(sys, 'getandroidapilevel') else '/bin/sh')
            args = [unix_shell, "-c"] + args
            if executable:
                args[0] = executable
    
        if executable is None:
            executable = args[0]
    
        sys.audit("subprocess.Popen", executable, args, cwd, env)
    
        if (_USE_POSIX_SPAWN
>               and os.path.dirname(executable)
                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^
                and preexec_fn is None
                and not close_fds
                and not pass_fds
                and cwd is None
                and (p2cread == -1 or p2cread > 2)
                and (c2pwrite == -1 or c2pwrite > 2)
                and (errwrite == -1 or errwrite > 2)
                and not start_new_session
                and process_group == -1
                and gid is None
                and gids is None
                and uid is None
                and umask < 0):

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1826: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

p = None

>   ???
E   TypeError: expected str, bytes or os.PathLike object, not NoneType

<frozen posixpath>:152: TypeError
__________ TestGenerateLocalServerCert.test_sni_matches_cert_san_list __________

self = <tests.test_ssl_reserved_sni.TestGenerateLocalServerCert object at 0x10851d190>
test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10a4cb490>

    async def test_sni_matches_cert_san_list(self, test_db):
>       ca_id = await _create_ca(test_db, "rsa")
                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

tests/test_ssl_reserved_sni.py:229: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10a4cb490>
algorithm = 'rsa'

    async def _create_ca(test_db, algorithm: str = "rsa") -> int:
        """Create a real CA record in test_db, return its id."""
        from app.services.cert_generator import generate_ca_certificate, detect_openssl
    
        info = detect_openssl()
        if algorithm == "sm2" and not info["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
>       result, _ = generate_ca_certificate(
            openssl_path=info["path"],
            common_name=f"Test CA {algorithm}",
            validity_days=3650,
            flavor=info["flavor"],
            algorithm=algorithm,
        )

tests/test_ssl_reserved_sni.py:47: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None, common_name = 'Test CA rsa', validity_days = 3650
flavor = 'unknown', algorithm = 'rsa', org = 'EMBRACE', ou = 'EDGE'

    def generate_ca_certificate(
        openssl_path: str,
        common_name: str,
        validity_days: int,
        flavor: str,
        algorithm: str = "sm2",
        org: str = "EMBRACE",
        ou: str = "EDGE",
    ) -> tuple[dict, list[CommandResult]]:
        """Generate a self-signed CA root certificate.
    
        Supports sm2, rsa, and ecc algorithms.
    
        Returns (result_dict, logs) where result_dict has keys: ca_cert, ca_key.
        """
        logs: list[CommandResult] = []
    
        hash_alg = "sm3" if algorithm == "sm2" else "sha256"
    
        if algorithm == "sm2":
            ca_key, key_logs = generate_sm2_keypair(openssl_path)
        elif algorithm == "rsa":
>           ca_key, key_logs = generate_rsa_keypair(openssl_path)
                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

app/services/cert_generator.py:435: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None

    def generate_rsa_keypair(openssl_path: str) -> tuple[str, list[CommandResult]]:
        """Generate an RSA 2048-bit key pair. Returns (private_key_pem, logs)."""
        with tempfile.TemporaryDirectory(prefix="panshi_rsa_") as tmpdir:
            key_file = Path(tmpdir) / "rsa.key"
>           result = _run_openssl(
                ["genrsa", "-out", str(key_file), "2048"],
                openssl_path,
            )

app/services/cert_generator.py:181: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

cmd = ['genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_mdeuxqd1/rsa.key', '2048']
openssl_path = None

    def _run_openssl(cmd: list[str], openssl_path: str) -> CommandResult:
        """Run an openssl command and return the result with command info."""
        full_cmd = [openssl_path] + cmd
>       result = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )

app/services/cert_generator.py:69: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

input = None, capture_output = True, timeout = 30, check = False
popenargs = ([None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_mdeuxqd1/rsa.key', '2048'],)
kwargs = {'stderr': -1, 'stdout': -1, 'text': True}

    def run(*popenargs,
            input=None, capture_output=False, timeout=None, check=False, **kwargs):
        """Run command with arguments and return a CompletedProcess instance.
    
        The returned instance will have attributes args, returncode, stdout and
        stderr. By default, stdout and stderr are not captured, and those attributes
        will be None. Pass stdout=PIPE and/or stderr=PIPE in order to capture them,
        or pass capture_output=True to capture both.
    
        If check is True and the exit code was non-zero, it raises a
        CalledProcessError. The CalledProcessError object will have the return code
        in the returncode attribute, and output & stderr attributes if those streams
        were captured.
    
        If timeout is given, and the process takes too long, a TimeoutExpired
        exception will be raised.
    
        There is an optional argument "input", allowing you to
        pass bytes or a string to the subprocess's stdin.  If you use this argument
        you may not also use the Popen constructor's "stdin" argument, as
        it will be used internally.
    
        By default, all communication is in bytes, and therefore any "input" should
        be bytes, and the stdout and stderr will be bytes. If in text mode, any
        "input" should be a string, and stdout and stderr will be strings decoded
        according to locale encoding, or by "encoding" if set. Text mode is
        triggered by setting any of text, encoding, errors or universal_newlines.
    
        The other arguments are the same as for the Popen constructor.
        """
        if input is not None:
            if kwargs.get('stdin') is not None:
                raise ValueError('stdin and input arguments may not both be used.')
            kwargs['stdin'] = PIPE
    
        if capture_output:
            if kwargs.get('stdout') is not None or kwargs.get('stderr') is not None:
                raise ValueError('stdout and stderr arguments may not be used '
                                 'with capture_output.')
            kwargs['stdout'] = PIPE
            kwargs['stderr'] = PIPE
    
>       with Popen(*popenargs, **kwargs) as process:
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:548: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_mdeuxqd1/rsa.key', '2048']
bufsize = -1, executable = None, stdin = None, stdout = -1, stderr = -1
preexec_fn = None, close_fds = True, shell = False, cwd = None, env = None
universal_newlines = None, startupinfo = None, creationflags = 0
restore_signals = True, start_new_session = False, pass_fds = ()

    def __init__(self, args, bufsize=-1, executable=None,
                 stdin=None, stdout=None, stderr=None,
                 preexec_fn=None, close_fds=True,
                 shell=False, cwd=None, env=None, universal_newlines=None,
                 startupinfo=None, creationflags=0,
                 restore_signals=True, start_new_session=False,
                 pass_fds=(), *, user=None, group=None, extra_groups=None,
                 encoding=None, errors=None, text=None, umask=-1, pipesize=-1,
                 process_group=None):
        """Create new Popen instance."""
        if not _can_fork_exec:
            raise OSError(
                errno.ENOTSUP, f"{sys.platform} does not support processes."
            )
    
        _cleanup()
        # Held while anything is calling waitpid before returncode has been
        # updated to prevent clobbering returncode if wait() or poll() are
        # called from multiple threads at once.  After acquiring the lock,
        # code must re-check self.returncode to see if another thread just
        # finished a waitpid() call.
        self._waitpid_lock = threading.Lock()
    
        self._input = None
        self._communication_started = False
        if bufsize is None:
            bufsize = -1  # Restore default
        if not isinstance(bufsize, int):
            raise TypeError("bufsize must be an integer")
    
        if pipesize is None:
            pipesize = -1  # Restore default
        if not isinstance(pipesize, int):
            raise TypeError("pipesize must be an integer")
    
        if _mswindows:
            if preexec_fn is not None:
                raise ValueError("preexec_fn is not supported on Windows "
                                 "platforms")
        else:
            # POSIX
            if pass_fds and not close_fds:
                warnings.warn("pass_fds overriding close_fds.", RuntimeWarning)
                close_fds = True
            if startupinfo is not None:
                raise ValueError("startupinfo is only supported on Windows "
                                 "platforms")
            if creationflags != 0:
                raise ValueError("creationflags is only supported on Windows "
                                 "platforms")
    
        self.args = args
        self.stdin = None
        self.stdout = None
        self.stderr = None
        self.pid = None
        self.returncode = None
        self.encoding = encoding
        self.errors = errors
        self.pipesize = pipesize
    
        # Validate the combinations of text and universal_newlines
        if (text is not None and universal_newlines is not None
            and bool(universal_newlines) != bool(text)):
            raise SubprocessError('Cannot disambiguate when both text '
                                  'and universal_newlines are supplied but '
                                  'different. Pass one or the other.')
    
        self.text_mode = encoding or errors or text or universal_newlines
        if self.text_mode and encoding is None:
            self.encoding = encoding = _text_encoding()
    
        # How long to resume waiting on a child after the first ^C.
        # There is no right value for this.  The purpose is to be polite
        # yet remain good for interactive users trying to exit a tool.
        self._sigint_wait_secs = 0.25  # 1/xkcd221.getRandomNumber()
    
        self._closed_child_pipe_fds = False
    
        if self.text_mode:
            if bufsize == 1:
                line_buffering = True
                # Use the default buffer size for the underlying binary streams
                # since they don't support line buffering.
                bufsize = -1
            else:
                line_buffering = False
    
        if process_group is None:
            process_group = -1  # The internal APIs are int-only
    
        gid = None
        if group is not None:
            if not hasattr(os, 'setregid'):
                raise ValueError("The 'group' parameter is not supported on the "
                                 "current platform")
    
            elif isinstance(group, str):
                try:
                    import grp
                except ImportError:
                    raise ValueError("The group parameter cannot be a string "
                                     "on systems without the grp module")
    
                gid = grp.getgrnam(group).gr_gid
            elif isinstance(group, int):
                gid = group
            else:
                raise TypeError("Group must be a string or an integer, not {}"
                                .format(type(group)))
    
            if gid < 0:
                raise ValueError(f"Group ID cannot be negative, got {gid}")
    
        gids = None
        if extra_groups is not None:
            if not hasattr(os, 'setgroups'):
                raise ValueError("The 'extra_groups' parameter is not "
                                 "supported on the current platform")
    
            elif isinstance(extra_groups, str):
                raise ValueError("Groups must be a list, not a string")
    
            gids = []
            for extra_group in extra_groups:
                if isinstance(extra_group, str):
                    try:
                        import grp
                    except ImportError:
                        raise ValueError("Items in extra_groups cannot be "
                                         "strings on systems without the "
                                         "grp module")
    
                    gids.append(grp.getgrnam(extra_group).gr_gid)
                elif isinstance(extra_group, int):
                    gids.append(extra_group)
                else:
                    raise TypeError("Items in extra_groups must be a string "
                                    "or integer, not {}"
                                    .format(type(extra_group)))
    
            # make sure that the gids are all positive here so we can do less
            # checking in the C code
            for gid_check in gids:
                if gid_check < 0:
                    raise ValueError(f"Group ID cannot be negative, got {gid_check}")
    
        uid = None
        if user is not None:
            if not hasattr(os, 'setreuid'):
                raise ValueError("The 'user' parameter is not supported on "
                                 "the current platform")
    
            elif isinstance(user, str):
                try:
                    import pwd
                except ImportError:
                    raise ValueError("The user parameter cannot be a string "
                                     "on systems without the pwd module")
                uid = pwd.getpwnam(user).pw_uid
            elif isinstance(user, int):
                uid = user
            else:
                raise TypeError("User must be a string or an integer")
    
            if uid < 0:
                raise ValueError(f"User ID cannot be negative, got {uid}")
    
        # Input and output objects. The general principle is like
        # this:
        #
        # Parent                   Child
        # ------                   -----
        # p2cwrite   ---stdin--->  p2cread
        # c2pread    <--stdout---  c2pwrite
        # errread    <--stderr---  errwrite
        #
        # On POSIX, the child objects are file descriptors.  On
        # Windows, these are Windows file handles.  The parent objects
        # are file descriptors on both platforms.  The parent objects
        # are -1 when not using PIPEs. The child objects are -1
        # when not redirecting.
    
        (p2cread, p2cwrite,
         c2pread, c2pwrite,
         errread, errwrite) = self._get_handles(stdin, stdout, stderr)
    
        # From here on, raising exceptions may cause file descriptor leakage
    
        # We wrap OS handles *before* launching the child, otherwise a
        # quickly terminating child could make our fds unwrappable
        # (see #8458).
    
        if _mswindows:
            if p2cwrite != -1:
                p2cwrite = msvcrt.open_osfhandle(p2cwrite.Detach(), 0)
            if c2pread != -1:
                c2pread = msvcrt.open_osfhandle(c2pread.Detach(), 0)
            if errread != -1:
                errread = msvcrt.open_osfhandle(errread.Detach(), 0)
    
        try:
            if p2cwrite != -1:
                self.stdin = io.open(p2cwrite, 'wb', bufsize)
                if self.text_mode:
                    self.stdin = io.TextIOWrapper(self.stdin, write_through=True,
                            line_buffering=line_buffering,
                            encoding=encoding, errors=errors)
            if c2pread != -1:
                self.stdout = io.open(c2pread, 'rb', bufsize)
                if self.text_mode:
                    self.stdout = io.TextIOWrapper(self.stdout,
                            encoding=encoding, errors=errors)
            if errread != -1:
                self.stderr = io.open(errread, 'rb', bufsize)
                if self.text_mode:
                    self.stderr = io.TextIOWrapper(self.stderr,
                            encoding=encoding, errors=errors)
    
>           self._execute_child(args, executable, preexec_fn, close_fds,
                                pass_fds, cwd, env,
                                startupinfo, creationflags, shell,
                                p2cread, p2cwrite,
                                c2pread, c2pwrite,
                                errread, errwrite,
                                restore_signals,
                                gid, gids, uid, umask,
                                start_new_session, process_group)

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1026: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_mdeuxqd1/rsa.key', '2048']
executable = None, preexec_fn = None, close_fds = True, pass_fds = ()
cwd = None, env = None, startupinfo = None, creationflags = 0, shell = False
p2cread = -1, p2cwrite = -1, c2pread = 14, c2pwrite = 15, errread = 16
errwrite = 17, restore_signals = True, gid = None, gids = None, uid = None
umask = -1, start_new_session = False, process_group = -1

    def _execute_child(self, args, executable, preexec_fn, close_fds,
                       pass_fds, cwd, env,
                       startupinfo, creationflags, shell,
                       p2cread, p2cwrite,
                       c2pread, c2pwrite,
                       errread, errwrite,
                       restore_signals,
                       gid, gids, uid, umask,
                       start_new_session, process_group):
        """Execute program (POSIX version)"""
    
        if isinstance(args, (str, bytes)):
            args = [args]
        elif isinstance(args, os.PathLike):
            if shell:
                raise TypeError('path-like args is not allowed when '
                                'shell is true')
            args = [args]
        else:
            args = list(args)
    
        if shell:
            # On Android the default shell is at '/system/bin/sh'.
            unix_shell = ('/system/bin/sh' if
                      hasattr(sys, 'getandroidapilevel') else '/bin/sh')
            args = [unix_shell, "-c"] + args
            if executable:
                args[0] = executable
    
        if executable is None:
            executable = args[0]
    
        sys.audit("subprocess.Popen", executable, args, cwd, env)
    
        if (_USE_POSIX_SPAWN
>               and os.path.dirname(executable)
                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^
                and preexec_fn is None
                and not close_fds
                and not pass_fds
                and cwd is None
                and (p2cread == -1 or p2cread > 2)
                and (c2pwrite == -1 or c2pwrite > 2)
                and (errwrite == -1 or errwrite > 2)
                and not start_new_session
                and process_group == -1
                and gid is None
                and gids is None
                and uid is None
                and umask < 0):

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1826: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

p = None

>   ???
E   TypeError: expected str, bytes or os.PathLike object, not NoneType

<frozen posixpath>:152: TypeError
_____ TestGenerateLocalClientCert.test_cert_type_client_request_not_merged _____

self = <tests.test_ssl_reserved_sni.TestGenerateLocalClientCert object at 0x10851eb50>
test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10bb916d0>

    async def test_cert_type_client_request_not_merged(self, test_db):
>       ca_id = await _create_ca(test_db, "rsa")
                ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

tests/test_ssl_reserved_sni.py:284: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

test_db = <sqlalchemy.ext.asyncio.session.AsyncSession object at 0x10bb916d0>
algorithm = 'rsa'

    async def _create_ca(test_db, algorithm: str = "rsa") -> int:
        """Create a real CA record in test_db, return its id."""
        from app.services.cert_generator import generate_ca_certificate, detect_openssl
    
        info = detect_openssl()
        if algorithm == "sm2" and not info["sm2_supported"]:
            pytest.skip("No SM2-capable openssl available")
>       result, _ = generate_ca_certificate(
            openssl_path=info["path"],
            common_name=f"Test CA {algorithm}",
            validity_days=3650,
            flavor=info["flavor"],
            algorithm=algorithm,
        )

tests/test_ssl_reserved_sni.py:47: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None, common_name = 'Test CA rsa', validity_days = 3650
flavor = 'unknown', algorithm = 'rsa', org = 'EMBRACE', ou = 'EDGE'

    def generate_ca_certificate(
        openssl_path: str,
        common_name: str,
        validity_days: int,
        flavor: str,
        algorithm: str = "sm2",
        org: str = "EMBRACE",
        ou: str = "EDGE",
    ) -> tuple[dict, list[CommandResult]]:
        """Generate a self-signed CA root certificate.
    
        Supports sm2, rsa, and ecc algorithms.
    
        Returns (result_dict, logs) where result_dict has keys: ca_cert, ca_key.
        """
        logs: list[CommandResult] = []
    
        hash_alg = "sm3" if algorithm == "sm2" else "sha256"
    
        if algorithm == "sm2":
            ca_key, key_logs = generate_sm2_keypair(openssl_path)
        elif algorithm == "rsa":
>           ca_key, key_logs = generate_rsa_keypair(openssl_path)
                               ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^

app/services/cert_generator.py:435: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

openssl_path = None

    def generate_rsa_keypair(openssl_path: str) -> tuple[str, list[CommandResult]]:
        """Generate an RSA 2048-bit key pair. Returns (private_key_pem, logs)."""
        with tempfile.TemporaryDirectory(prefix="panshi_rsa_") as tmpdir:
            key_file = Path(tmpdir) / "rsa.key"
>           result = _run_openssl(
                ["genrsa", "-out", str(key_file), "2048"],
                openssl_path,
            )

app/services/cert_generator.py:181: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

cmd = ['genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_tyx_rkps/rsa.key', '2048']
openssl_path = None

    def _run_openssl(cmd: list[str], openssl_path: str) -> CommandResult:
        """Run an openssl command and return the result with command info."""
        full_cmd = [openssl_path] + cmd
>       result = subprocess.run(
            full_cmd,
            capture_output=True,
            text=True,
            timeout=30,
        )

app/services/cert_generator.py:69: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

input = None, capture_output = True, timeout = 30, check = False
popenargs = ([None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_tyx_rkps/rsa.key', '2048'],)
kwargs = {'stderr': -1, 'stdout': -1, 'text': True}

    def run(*popenargs,
            input=None, capture_output=False, timeout=None, check=False, **kwargs):
        """Run command with arguments and return a CompletedProcess instance.
    
        The returned instance will have attributes args, returncode, stdout and
        stderr. By default, stdout and stderr are not captured, and those attributes
        will be None. Pass stdout=PIPE and/or stderr=PIPE in order to capture them,
        or pass capture_output=True to capture both.
    
        If check is True and the exit code was non-zero, it raises a
        CalledProcessError. The CalledProcessError object will have the return code
        in the returncode attribute, and output & stderr attributes if those streams
        were captured.
    
        If timeout is given, and the process takes too long, a TimeoutExpired
        exception will be raised.
    
        There is an optional argument "input", allowing you to
        pass bytes or a string to the subprocess's stdin.  If you use this argument
        you may not also use the Popen constructor's "stdin" argument, as
        it will be used internally.
    
        By default, all communication is in bytes, and therefore any "input" should
        be bytes, and the stdout and stderr will be bytes. If in text mode, any
        "input" should be a string, and stdout and stderr will be strings decoded
        according to locale encoding, or by "encoding" if set. Text mode is
        triggered by setting any of text, encoding, errors or universal_newlines.
    
        The other arguments are the same as for the Popen constructor.
        """
        if input is not None:
            if kwargs.get('stdin') is not None:
                raise ValueError('stdin and input arguments may not both be used.')
            kwargs['stdin'] = PIPE
    
        if capture_output:
            if kwargs.get('stdout') is not None or kwargs.get('stderr') is not None:
                raise ValueError('stdout and stderr arguments may not be used '
                                 'with capture_output.')
            kwargs['stdout'] = PIPE
            kwargs['stderr'] = PIPE
    
>       with Popen(*popenargs, **kwargs) as process:
             ^^^^^^^^^^^^^^^^^^^^^^^^^^^

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:548: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_tyx_rkps/rsa.key', '2048']
bufsize = -1, executable = None, stdin = None, stdout = -1, stderr = -1
preexec_fn = None, close_fds = True, shell = False, cwd = None, env = None
universal_newlines = None, startupinfo = None, creationflags = 0
restore_signals = True, start_new_session = False, pass_fds = ()

    def __init__(self, args, bufsize=-1, executable=None,
                 stdin=None, stdout=None, stderr=None,
                 preexec_fn=None, close_fds=True,
                 shell=False, cwd=None, env=None, universal_newlines=None,
                 startupinfo=None, creationflags=0,
                 restore_signals=True, start_new_session=False,
                 pass_fds=(), *, user=None, group=None, extra_groups=None,
                 encoding=None, errors=None, text=None, umask=-1, pipesize=-1,
                 process_group=None):
        """Create new Popen instance."""
        if not _can_fork_exec:
            raise OSError(
                errno.ENOTSUP, f"{sys.platform} does not support processes."
            )
    
        _cleanup()
        # Held while anything is calling waitpid before returncode has been
        # updated to prevent clobbering returncode if wait() or poll() are
        # called from multiple threads at once.  After acquiring the lock,
        # code must re-check self.returncode to see if another thread just
        # finished a waitpid() call.
        self._waitpid_lock = threading.Lock()
    
        self._input = None
        self._communication_started = False
        if bufsize is None:
            bufsize = -1  # Restore default
        if not isinstance(bufsize, int):
            raise TypeError("bufsize must be an integer")
    
        if pipesize is None:
            pipesize = -1  # Restore default
        if not isinstance(pipesize, int):
            raise TypeError("pipesize must be an integer")
    
        if _mswindows:
            if preexec_fn is not None:
                raise ValueError("preexec_fn is not supported on Windows "
                                 "platforms")
        else:
            # POSIX
            if pass_fds and not close_fds:
                warnings.warn("pass_fds overriding close_fds.", RuntimeWarning)
                close_fds = True
            if startupinfo is not None:
                raise ValueError("startupinfo is only supported on Windows "
                                 "platforms")
            if creationflags != 0:
                raise ValueError("creationflags is only supported on Windows "
                                 "platforms")
    
        self.args = args
        self.stdin = None
        self.stdout = None
        self.stderr = None
        self.pid = None
        self.returncode = None
        self.encoding = encoding
        self.errors = errors
        self.pipesize = pipesize
    
        # Validate the combinations of text and universal_newlines
        if (text is not None and universal_newlines is not None
            and bool(universal_newlines) != bool(text)):
            raise SubprocessError('Cannot disambiguate when both text '
                                  'and universal_newlines are supplied but '
                                  'different. Pass one or the other.')
    
        self.text_mode = encoding or errors or text or universal_newlines
        if self.text_mode and encoding is None:
            self.encoding = encoding = _text_encoding()
    
        # How long to resume waiting on a child after the first ^C.
        # There is no right value for this.  The purpose is to be polite
        # yet remain good for interactive users trying to exit a tool.
        self._sigint_wait_secs = 0.25  # 1/xkcd221.getRandomNumber()
    
        self._closed_child_pipe_fds = False
    
        if self.text_mode:
            if bufsize == 1:
                line_buffering = True
                # Use the default buffer size for the underlying binary streams
                # since they don't support line buffering.
                bufsize = -1
            else:
                line_buffering = False
    
        if process_group is None:
            process_group = -1  # The internal APIs are int-only
    
        gid = None
        if group is not None:
            if not hasattr(os, 'setregid'):
                raise ValueError("The 'group' parameter is not supported on the "
                                 "current platform")
    
            elif isinstance(group, str):
                try:
                    import grp
                except ImportError:
                    raise ValueError("The group parameter cannot be a string "
                                     "on systems without the grp module")
    
                gid = grp.getgrnam(group).gr_gid
            elif isinstance(group, int):
                gid = group
            else:
                raise TypeError("Group must be a string or an integer, not {}"
                                .format(type(group)))
    
            if gid < 0:
                raise ValueError(f"Group ID cannot be negative, got {gid}")
    
        gids = None
        if extra_groups is not None:
            if not hasattr(os, 'setgroups'):
                raise ValueError("The 'extra_groups' parameter is not "
                                 "supported on the current platform")
    
            elif isinstance(extra_groups, str):
                raise ValueError("Groups must be a list, not a string")
    
            gids = []
            for extra_group in extra_groups:
                if isinstance(extra_group, str):
                    try:
                        import grp
                    except ImportError:
                        raise ValueError("Items in extra_groups cannot be "
                                         "strings on systems without the "
                                         "grp module")
    
                    gids.append(grp.getgrnam(extra_group).gr_gid)
                elif isinstance(extra_group, int):
                    gids.append(extra_group)
                else:
                    raise TypeError("Items in extra_groups must be a string "
                                    "or integer, not {}"
                                    .format(type(extra_group)))
    
            # make sure that the gids are all positive here so we can do less
            # checking in the C code
            for gid_check in gids:
                if gid_check < 0:
                    raise ValueError(f"Group ID cannot be negative, got {gid_check}")
    
        uid = None
        if user is not None:
            if not hasattr(os, 'setreuid'):
                raise ValueError("The 'user' parameter is not supported on "
                                 "the current platform")
    
            elif isinstance(user, str):
                try:
                    import pwd
                except ImportError:
                    raise ValueError("The user parameter cannot be a string "
                                     "on systems without the pwd module")
                uid = pwd.getpwnam(user).pw_uid
            elif isinstance(user, int):
                uid = user
            else:
                raise TypeError("User must be a string or an integer")
    
            if uid < 0:
                raise ValueError(f"User ID cannot be negative, got {uid}")
    
        # Input and output objects. The general principle is like
        # this:
        #
        # Parent                   Child
        # ------                   -----
        # p2cwrite   ---stdin--->  p2cread
        # c2pread    <--stdout---  c2pwrite
        # errread    <--stderr---  errwrite
        #
        # On POSIX, the child objects are file descriptors.  On
        # Windows, these are Windows file handles.  The parent objects
        # are file descriptors on both platforms.  The parent objects
        # are -1 when not using PIPEs. The child objects are -1
        # when not redirecting.
    
        (p2cread, p2cwrite,
         c2pread, c2pwrite,
         errread, errwrite) = self._get_handles(stdin, stdout, stderr)
    
        # From here on, raising exceptions may cause file descriptor leakage
    
        # We wrap OS handles *before* launching the child, otherwise a
        # quickly terminating child could make our fds unwrappable
        # (see #8458).
    
        if _mswindows:
            if p2cwrite != -1:
                p2cwrite = msvcrt.open_osfhandle(p2cwrite.Detach(), 0)
            if c2pread != -1:
                c2pread = msvcrt.open_osfhandle(c2pread.Detach(), 0)
            if errread != -1:
                errread = msvcrt.open_osfhandle(errread.Detach(), 0)
    
        try:
            if p2cwrite != -1:
                self.stdin = io.open(p2cwrite, 'wb', bufsize)
                if self.text_mode:
                    self.stdin = io.TextIOWrapper(self.stdin, write_through=True,
                            line_buffering=line_buffering,
                            encoding=encoding, errors=errors)
            if c2pread != -1:
                self.stdout = io.open(c2pread, 'rb', bufsize)
                if self.text_mode:
                    self.stdout = io.TextIOWrapper(self.stdout,
                            encoding=encoding, errors=errors)
            if errread != -1:
                self.stderr = io.open(errread, 'rb', bufsize)
                if self.text_mode:
                    self.stderr = io.TextIOWrapper(self.stderr,
                            encoding=encoding, errors=errors)
    
>           self._execute_child(args, executable, preexec_fn, close_fds,
                                pass_fds, cwd, env,
                                startupinfo, creationflags, shell,
                                p2cread, p2cwrite,
                                c2pread, c2pwrite,
                                errread, errwrite,
                                restore_signals,
                                gid, gids, uid, umask,
                                start_new_session, process_group)

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1026: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

self = <Popen: returncode: None args: [None, 'genrsa', '-out', '/var/folders/sz/ght...>
args = [None, 'genrsa', '-out', '/var/folders/sz/ghtghjrx2ys8crbwbp65rk4c0000gn/T/panshi_rsa_tyx_rkps/rsa.key', '2048']
executable = None, preexec_fn = None, close_fds = True, pass_fds = ()
cwd = None, env = None, startupinfo = None, creationflags = 0, shell = False
p2cread = -1, p2cwrite = -1, c2pread = 14, c2pwrite = 15, errread = 16
errwrite = 17, restore_signals = True, gid = None, gids = None, uid = None
umask = -1, start_new_session = False, process_group = -1

    def _execute_child(self, args, executable, preexec_fn, close_fds,
                       pass_fds, cwd, env,
                       startupinfo, creationflags, shell,
                       p2cread, p2cwrite,
                       c2pread, c2pwrite,
                       errread, errwrite,
                       restore_signals,
                       gid, gids, uid, umask,
                       start_new_session, process_group):
        """Execute program (POSIX version)"""
    
        if isinstance(args, (str, bytes)):
            args = [args]
        elif isinstance(args, os.PathLike):
            if shell:
                raise TypeError('path-like args is not allowed when '
                                'shell is true')
            args = [args]
        else:
            args = list(args)
    
        if shell:
            # On Android the default shell is at '/system/bin/sh'.
            unix_shell = ('/system/bin/sh' if
                      hasattr(sys, 'getandroidapilevel') else '/bin/sh')
            args = [unix_shell, "-c"] + args
            if executable:
                args[0] = executable
    
        if executable is None:
            executable = args[0]
    
        sys.audit("subprocess.Popen", executable, args, cwd, env)
    
        if (_USE_POSIX_SPAWN
>               and os.path.dirname(executable)
                    ^^^^^^^^^^^^^^^^^^^^^^^^^^^
                and preexec_fn is None
                and not close_fds
                and not pass_fds
                and cwd is None
                and (p2cread == -1 or p2cread > 2)
                and (c2pwrite == -1 or c2pwrite > 2)
                and (errwrite == -1 or errwrite > 2)
                and not start_new_session
                and process_group == -1
                and gid is None
                and gids is None
                and uid is None
                and umask < 0):

../../../.local/share/uv/python/cpython-3.11.15-macos-aarch64-none/lib/python3.11/subprocess.py:1826: 
_ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ _ 

p = None

>   ???
E   TypeError: expected str, bytes or os.PathLike object, not NoneType

<frozen posixpath>:152: TypeError
=============================== warnings summary ===============================
tests/test_cert_generator.py: 16 warnings
tests/test_ssl_reserved_sni.py: 3 warnings
  /Users/qichenguang/project/test-03/backend/.venv/lib/python3.11/site-packages/pydantic/_internal/_config.py:291: PydanticDeprecatedSince20: Support for class-based `config` is deprecated, use ConfigDict instead. Deprecated in Pydantic V2.0 to be removed in V3.0. See Pydantic V2 Migration Guide at https://errors.pydantic.dev/2.9/migration/
    warnings.warn(DEPRECATION_MESSAGE, DeprecationWarning)

-- Docs: https://docs.pytest.org/en/stable/how-to/capture-warnings.html
=========================== short test summary info ============================
FAILED tests/test_cert_generator.py::TestDetectOpenssl::test_finds_some_openssl
FAILED tests/test_cert_generator.py::TestDetectOpenssl::test_collects_detect_logs
FAILED tests/test_cert_generator.py::TestLocalProvider::test_provider_detects_openssl
FAILED tests/test_ssl_reserved_sni.py::TestGenerateLocalServerCert::test_rsa_server_sni_contains_edge_local
FAILED tests/test_ssl_reserved_sni.py::TestGenerateLocalServerCert::test_rsa_server_cert_san_contains_edge_local
FAILED tests/test_ssl_reserved_sni.py::TestGenerateLocalServerCert::test_ecc_server_cert_san_contains_edge_local
FAILED tests/test_ssl_reserved_sni.py::TestGenerateLocalServerCert::test_empty_dns_still_gets_edge_local
FAILED tests/test_ssl_reserved_sni.py::TestGenerateLocalServerCert::test_user_dns_case_normalized_and_deduped
FAILED tests/test_ssl_reserved_sni.py::TestGenerateLocalServerCert::test_ip_sans_stripped_and_preserved
FAILED tests/test_ssl_reserved_sni.py::TestGenerateLocalServerCert::test_sni_matches_cert_san_list
FAILED tests/test_ssl_reserved_sni.py::TestGenerateLocalClientCert::test_cert_type_client_request_not_merged
11 failed, 53 passed, 52 skipped, 19 warnings in 1.92s

=== 初步归类 (1.3) ===
簇: A 证书/OpenSSL (11 失败)
根因: detect_openssl() 返回 path=None 导致级联失败
环境事实: openssl 存在 /opt/homebrew/bin/openssl (OpenSSL 3.6.3)
D2 归类: 代码缺陷 — 检测逻辑未覆盖 homebrew 路径或无法解析 OpenSSL 3.x 版本输出
置信度: 0.9
建议修复: 扩展 detect_openssl() 搜索路径含 /opt/homebrew/bin, /usr/local/bin；兼容 OpenSSL 3.x version 字符串解析
涉及文件: app/services/cert_generator.py (detect_openssl, LocalProvider), tests/test_cert_generator.py, tests/test_ssl_reserved_sni.py

=== 修复结论 ===
根因: detect_openssl() 仅查找 bundled Tongsuo，不回退系统 PATH
处置: 代码缺陷 → 最小修复
修改: app/services/cert_generator.py detect_openssl() 增加 3 级回退:
  1. bundled Tongsuo (backend/bin/openssl) - 优先，支持 SM2
  2. shutil.which("openssl") 搜索 PATH
  3. 显式常见路径 (/opt/homebrew/bin, /usr/local/bin, /usr/bin)
验证: test_cert_generator.py::TestDetectOpenssl 3/3 PASS, TestLocalProvider 3/3 PASS, test_ssl_reserved_sni.py 41/41 PASS
D2 归类: 代码缺陷 (实现与测试期望不符，修复实现)
涉及提交: 待用户显式请求
