c     Driver for capturing the iteration-wise trajectory of L-BFGS-B v3.0
c     on Rosenbrock 5D with bounds, for parity-testing basin's port.
c
c     Output: TSV to stdout, one line per iterate, columns
c       iter f x(1)...x(n) g(1)...g(n)
c     where iter is the Fortran iter counter (0 = post-init, before any
c     line searches; 1.. = after each NEW_X), and f / x / g are the
c     state Fortran has decided is "current" at that iter.
c
c     Build + run: see README.md in this directory. Requires the
c     L-BFGS-B v3.0 BSD-3 source (not vendored in this repo).
c
c     Problem setup (locked, must match the Rust parity test):
c       n        = 5
c       m        = 5
c       bounds   = [0, 5]^5   (nbd(i) = 2 for all i)
c       start    = (-1, 2, -1, 2, -1)   (infeasible; gets projected to
c                                        (0, 2, 0, 2, 0))
c       factr    = 0   (no relative-f termination)
c       pgtol    = 0   (no pgtol termination; iter limit only)
c       max_iter = 30
c
c     Rosenbrock 5D (basin's standard form):
c       f(x) = sum_{i=0..n-2} [100 (x(i+1) - x(i)^2)^2 + (1 - x(i))^2]
c       df/dx(0)   = -400 x(0) (x(1) - x(0)^2) - 2 (1 - x(0))
c       df/dx(i)   = -400 x(i) (x(i+1) - x(i)^2) - 2 (1 - x(i))
c                    + 200 (x(i) - x(i-1)^2)        for 1 <= i <= n-2
c       df/dx(n-1) = 200 (x(n-1) - x(n-2)^2)

      program lbfgsb_driver

      integer          nmax, mmax
      parameter        (nmax=5, mmax=5)

      character*60     task, csave
      logical          lsave(4)
      integer          n, m, iprint, max_iter, iter,
     +                 nbd(nmax), iwa(3*nmax), isave(44)
      double precision f, factr, pgtol,
     +                 x(nmax), l(nmax), u(nmax), g(nmax), dsave(29),
     +                 wa(2*mmax*nmax + 5*nmax + 11*mmax*mmax + 8*mmax)
      integer          i

c     Suppress L-BFGS-B's own iteration banner.
      iprint = -1
      factr = 0.0d0
      pgtol = 0.0d0
      n = 5
      m = 5
      max_iter = 30

c     All variables two-sided bounded [0, 5].
      do 10 i = 1, n
         nbd(i) = 2
         l(i) = 0.0d0
         u(i) = 5.0d0
  10  continue

c     Infeasible start; `active` will project it to (0, 2, 0, 2, 0).
      x(1) = -1.0d0
      x(2) = 2.0d0
      x(3) = -1.0d0
      x(4) = 2.0d0
      x(5) = -1.0d0

      task = 'START'
      iter = 0

 111  continue
      call setulb(n, m, x, l, u, nbd, f, g, factr, pgtol, wa, iwa, task,
     +            iprint, csave, lsave, isave, dsave)

      if (task(1:5) .eq. 'FG_ST') then
c        First callback: evaluate f, g at the (projected) initial x,
c        print this as iter 0, then continue.
         call evalfg(n, x, f, g)
         call print_state(0, n, f, x, g)
         goto 111
      endif
      if (task(1:5) .eq. 'FG_LN') then
         call evalfg(n, x, f, g)
         goto 111
      endif

      if (task(1:5) .eq. 'NEW_X') then
         iter = iter + 1
         call print_state(iter, n, f, x, g)
         if (iter .ge. max_iter) goto 999
         goto 111
      endif

 999  continue
      stop
      end


c     Evaluate Rosenbrock f and g at x.
      subroutine evalfg(n, x, f, g)
      integer          n, i
      double precision x(n), g(n), f, t

      f = 0.0d0
      do 20 i = 1, n
         g(i) = 0.0d0
  20  continue

      do 30 i = 1, n - 1
         t = x(i+1) - x(i) * x(i)
         f = f + 100.0d0 * t * t + (1.0d0 - x(i))**2
         g(i)   = g(i) - 400.0d0 * x(i) * t - 2.0d0 * (1.0d0 - x(i))
         g(i+1) = g(i+1) + 200.0d0 * t
  30  continue
      return
      end


c     Print one TSV line: iter f x(1..n) g(1..n) with 17-digit hex-equiv
c     precision (es24.16 gives full f64 round-trip).
      subroutine print_state(iter, n, f, x, g)
      integer          iter, n, i
      double precision f, x(n), g(n)

      write (*, 100) iter, f, (x(i), i = 1, n), (g(i), i = 1, n)
 100  format(i4, 11(1x, es24.16))
      return
      end
