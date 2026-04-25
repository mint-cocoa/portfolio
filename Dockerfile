FROM ubuntu:24.04 AS build

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        build-essential \
        ca-certificates \
        cmake \
        git \
        ninja-build \
        pkg-config \
        liburing-dev \
    && rm -rf /var/lib/apt/lists/*

ARG IOURING_RUNTIME_REF=main
WORKDIR /runtime-src
RUN git clone --depth 1 --branch "${IOURING_RUNTIME_REF}" \
        https://github.com/mint-cocoa/iouring-runtime.git . \
    && cmake -S . -B build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DBUILD_WEB=ON \
        -DBUILD_EXAMPLES=OFF \
        -DBUILD_TESTS=OFF \
        -DCMAKE_INSTALL_PREFIX=/opt/iouring-runtime \
    && cmake --build build --target install

WORKDIR /src
COPY CMakeLists.txt .
COPY src ./src
RUN cmake -S . -B build -G Ninja \
        -DCMAKE_BUILD_TYPE=Release \
        -DCMAKE_PREFIX_PATH=/opt/iouring-runtime \
    && cmake --build build --target portfolio_site

FROM ubuntu:24.04 AS runtime

ENV DEBIAN_FRONTEND=noninteractive
RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates liburing2 \
    && rm -rf /var/lib/apt/lists/*

RUN useradd --system --uid 10001 --home-dir /nonexistent --shell /usr/sbin/nologin portfolio \
    && mkdir -p /usr/share/portfolio \
    && chown -R portfolio:portfolio /usr/share/portfolio

COPY --from=build /src/build/portfolio_site /usr/local/bin/portfolio_site
COPY docs /usr/share/portfolio

USER portfolio
ENV PORTFOLIO_HOST=0.0.0.0 \
    PORTFOLIO_PORT=3000 \
    PORTFOLIO_STATIC_ROOT=/usr/share/portfolio
EXPOSE 3000
ENTRYPOINT ["/usr/local/bin/portfolio_site"]
