{
  description = "WarEra personal toolkit";

  inputs = {
    nixpkgs.url = "github:cachix/devenv-nixpkgs/rolling";
    devenv.url = "github:cachix/devenv";
    flake-parts.url = "github:hercules-ci/flake-parts";
  };

  nixConfig = {
    extra-trusted-public-keys = "devenv.cachix.org-1:w1cLUi8dv3hnoSPGAuibQv+f9TZLr6cv/Hm9XgU50cw=";
    extra-substituters = "https://devenv.cachix.org";
  };

  outputs = inputs @ { flake-parts, nixpkgs, ... }:
    flake-parts.lib.mkFlake { inherit inputs; } {
      imports = [ inputs.devenv.flakeModule ];
      systems = nixpkgs.lib.systems.flakeExposed;

      perSystem = { pkgs, ... }: {
        devenv.shells.default = {
          packages = with pkgs; [ git curl ];

          languages.javascript = {
            enable = true;
            package = pkgs.nodejs_22;
            pnpm.enable = true;
          };

          enterShell = ''
            echo "WarEra devenv: node $(node -v), pnpm $(pnpm -v 2>/dev/null || echo n/a)"
            if ! command -v vp >/dev/null 2>&1; then
              echo "Note: install Vite+ CLI with: curl -fsSL https://vite.plus | bash"
            fi
          '';
        };
      };
    };
}
