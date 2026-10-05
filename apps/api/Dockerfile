# syntax=docker/dockerfile:1
# Contexto de construcción: raíz del repositorio (ver docker-compose.yml).

FROM mcr.microsoft.com/dotnet/sdk:10.0.401-noble AS build
WORKDIR /src
COPY global.json Directory.Build.props Directory.Packages.props .editorconfig ./
COPY apps/api/BarcelonaPulse.Api.csproj apps/api/
RUN dotnet restore apps/api/BarcelonaPulse.Api.csproj
COPY apps/api/ apps/api/
# El documento OpenAPI se genera en el repositorio, no en la imagen.
RUN dotnet publish apps/api/BarcelonaPulse.Api.csproj -c Release -o /app --no-restore \
    -p:OpenApiGenerateDocuments=false

# Imagen mínima sin shell, usuario no root, con ICU y tzdata (Europe/Madrid).
FROM mcr.microsoft.com/dotnet/aspnet:10.0.12-noble-chiseled-extra AS runtime
WORKDIR /app
COPY --from=build /app .
EXPOSE 8080
ENTRYPOINT ["dotnet", "BarcelonaPulse.Api.dll"]
