FROM php:8.4-apache

RUN apt-get update \
 && apt-get install -y --no-install-recommends libpng-dev libjpeg-dev libzip-dev unzip \
 && docker-php-ext-configure gd --with-jpeg \
 && docker-php-ext-install -j"$(nproc)" pdo_mysql gd zip exif \
 && a2enmod rewrite \
 && sed -i 's/AllowOverride None/AllowOverride All/' /etc/apache2/apache2.conf \
 && rm -rf /var/lib/apt/lists/*

# ProcessWire core and blank profile, straight from the tagged release
ARG PW_VERSION
RUN curl -fsSL "https://github.com/processwire/processwire/archive/refs/tags/${PW_VERSION}.tar.gz" \
    | tar -xz --strip-components=1 -C /var/www/html \
 && cp /var/www/html/htaccess.txt /var/www/html/.htaccess \
 && mkdir -p /var/www/html/site/modules \
 && chown -R www-data:www-data /var/www/html
